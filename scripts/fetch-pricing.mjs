#!/usr/bin/env node
/**
 * 从中转站公开的 /api/pricing（new-api / one-api 系）抓价格，写成 data/observed/<id>.json。
 *
 *   node scripts/fetch-pricing.mjs                    # 只打印，不落盘
 *   node scripts/fetch-pricing.mjs --write            # 落盘 data/observed/
 *   node scripts/fetch-pricing.mjs --fixture tests/fixtures/newapi-pricing.json --write   # 离线自测
 *
 * 注意：抓到的只是「站内面值」，如果站点是「1 元 = 1 美元额度」的惯例（多数如此），
 * 面值即人民币价；如果站点按汇率收人民币，这一行会算错 —— 所以自动抓取的行一律标
 * 「未核验」，人工确认后才写进 data/providers/。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll, writeJson, DATA, ROOT } from './lib/io.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const WRITE = flag('--write');
const FIXTURE = opt('--fixture');
const ONLY = opt('--only');
const TIMEOUT = Number(opt('--timeout', '15000'));

const { models, providers } = loadAll();

/** 别名 -> 规范 id */
const aliasToId = new Map();
for (const [id, m] of Object.entries(models)) {
  aliasToId.set(id.toLowerCase(), id);
  for (const a of m.aliases || []) aliasToId.set(String(a).toLowerCase(), id);
}
const norm = (s) => String(s || '').toLowerCase().replace(/[\s_.]/g, '').replace(/-/g, '');
const normToId = new Map();
for (const [alias, id] of aliasToId) normToId.set(norm(alias), id);

function resolveModel(name) {
  return aliasToId.get(String(name).toLowerCase()) || normToId.get(norm(name)) || null;
}

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': 'token-radar/1.0 (+https://github.com)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`返回的不是 JSON（前 80 字：${text.slice(0, 80).replace(/\s+/g, ' ')})`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析 new-api /api/pricing。
 * 返回 { models: {id: {...}}, unmatched: [...], groupRatio }
 */
export function parseNewApiPricing(payload) {
  const groupRatio =
    (payload && (payload.group_ratio?.default ?? payload.group_ratio?.default_group)) ??
    (payload && payload.data && !Array.isArray(payload.data) ? payload.data.group_ratio : null) ??
    1;

  let list = [];
  if (Array.isArray(payload?.data)) list = payload.data;
  else if (Array.isArray(payload?.data?.data)) list = payload.data.data;
  else if (payload?.data && typeof payload.data === 'object') {
    list = Object.entries(payload.data)
      .filter(([, v]) => v && typeof v === 'object')
      .map(([k, v]) => ({ model_name: k, ...v }));
  }
  if (!list.length) throw new Error('没有找到价格数组（payload.data 为空或结构不认识）');

  const out = {};
  const unmatched = [];

  for (const item of list) {
    const name = item.model_name || item.model || item.name;
    if (!name) continue;
    const id = resolveModel(name);
    // quota_type=1 是「按次计费」，没有 token 单价，跳过
    if (Number(item.quota_type) === 1) continue;
    const ratio = Number(item.model_ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) continue;

    const gr = Number(item.group_ratio ?? groupRatio) || 1;
    // one-api 口径：1 USD = 500,000 quota，故 USD/1M = ratio × 2（再乘分组倍率）
    const input = ratio * 2 * gr;
    const completion = Number(item.completion_ratio) || 1;
    const output = input * completion;

    if (!id) {
      unmatched.push({ model_name: name, model_ratio: ratio, completion_ratio: completion });
      continue;
    }
    if (out[id]) continue;
    out[id] = {
      input: round(input),
      output: round(output),
      cache_read: null,
      raw: { model_ratio: ratio, completion_ratio: completion, group_ratio: gr, quota_type: item.quota_type ?? 0 },
    };
  }

  return { models: out, unmatched, groupRatio };
}

const round = (n) => Math.round(n * 10000) / 10000;

function endpointOf(p) {
  if (p.observed_endpoint) return p.observed_endpoint;
  if (p.pricing_url && /\/api\/pricing\/?$/.test(p.pricing_url)) return p.pricing_url;
  return null;
}

const targets = providers.filter((p) => p.kind !== 'official' && endpointOf(p) && (!ONLY || p.id === ONLY));

if (!targets.length) {
  console.log('没有需要抓取的站点（在 provider json 里加 observed_endpoint 或 pricing_url=/api/pricing）');
  process.exit(0);
}

let failures = 0;
for (const p of targets) {
  const endpoint = endpointOf(p);
  let payload;
  if (FIXTURE) {
    payload = JSON.parse(readFileSync(join(ROOT, FIXTURE), 'utf8'));
  } else {
    try {
      payload = await getJson(endpoint);
    } catch (err) {
      failures++;
      console.error(`✗ ${p.id}  ${endpoint}\n   ${err.message}`);
      continue;
    }
  }

  let parsed;
  try {
    parsed = parseNewApiPricing(payload);
  } catch (err) {
    failures++;
    console.error(`✗ ${p.id}  解析失败：${err.message}`);
    continue;
  }

  const ids = Object.keys(parsed.models);
  console.log(`✓ ${p.id}  匹配 ${ids.length} 个模型，未匹配 ${parsed.unmatched.length} 个${parsed.unmatched.length ? '：' + parsed.unmatched.slice(0, 5).map((u) => u.model_name).join(', ') : ''}`);

  const doc = {
    station_id: p.id,
    endpoint,
    fetched_at: new Date().toISOString(),
    assumption: 'face_value_1cny_per_usd',
    parser: 'new-api/pricing',
    group_ratio: parsed.groupRatio,
    models: parsed.models,
    unmatched: parsed.unmatched.slice(0, 50),
  };

  if (WRITE) {
    writeJson(join(DATA, 'observed', `${p.id}.json`), doc);
    console.log(`   → data/observed/${p.id}.json`);
  } else {
    console.log('   ' + JSON.stringify(ids.slice(0, 5).map((id) => `${id}=${parsed.models[id].input}/${parsed.models[id].output}`)));
  }
}

if (failures) {
  console.error(`\n${failures} 个站点抓取失败`);
  process.exit(1);
}
