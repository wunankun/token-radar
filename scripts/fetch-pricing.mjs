#!/usr/bin/env node
/**
 * 抓取中转站价格（new-api / one-api 系公开的 GET /api/pricing），落盘成候选快照。
 *
 *   node scripts/fetch-pricing.mjs                     # 抓 data/sources.json 里启用的站点，只打印不落盘
 *   node scripts/fetch-pricing.mjs --write             # 落盘 data/observed/ + data/price-history/
 *   node scripts/fetch-pricing.mjs --add https://x.com # 发现定价接口、抓一次、并把站点写进 sources.json
 *   node scripts/fetch-pricing.mjs --list              # 看看现在有哪些站点
 *   node scripts/fetch-pricing.mjs --only my-site      # 只抓一个
 *   node scripts/fetch-pricing.mjs --fixture tests/fixtures/newapi-pricing.json --write   # 离线自测
 *
 * 抓到的只是「站内面值」。多数站按「1 元 = 1 美元额度」的惯例，面值即人民币价；
 * 也有站按汇率收人民币。所以自动抓取的行一律「未核验」，人工确认后才写进 data/providers/。
 */
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll, readJson, writeJson, listJson, DATA, ROOT } from './lib/io.mjs';
import { discoverPricing, diffSnapshots, fetchJson, normalizeOrigin, parsePricing, runPool, FetchError } from './lib/crawl.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const WRITE = flag('--write');
const LIST = flag('--list');
const FIXTURE = opt('--fixture');
const ONLY = opt('--only');
const ADD = opt('--add');
const CONCURRENCY = Number(opt('--concurrency', '4')) || 4;
const TIMEOUT = Number(opt('--timeout', '15000')) || 15000;
const RETRIES = Number(opt('--retries', '2')) || 0;
const DRY = !WRITE;

const SOURCES_FILE = join(DATA, 'sources.json');
const OBSERVED = join(DATA, 'observed');
const HISTORY = join(DATA, 'price-history');

const { models, providers } = loadAll();

/* ---------- 模型名 → 规范 id ---------- */
const aliasToId = new Map();
for (const [id, m] of Object.entries(models)) {
  aliasToId.set(id.toLowerCase(), id);
  for (const a of m.aliases || []) aliasToId.set(String(a).toLowerCase(), id);
}
const norm = (s) => String(s || '').toLowerCase().replace(/[\s_.]/g, '').replace(/-/g, '');
const normToId = new Map();
for (const [alias, id] of aliasToId) normToId.set(norm(alias), id);
const resolveModel = (name) => aliasToId.get(String(name).toLowerCase()) || normToId.get(norm(name)) || null;

/* ---------- 站点清单 ---------- */
function loadSources() {
  const doc = existsSync(SOURCES_FILE) ? readJson(SOURCES_FILE) : { sources: [] };
  const sources = Array.isArray(doc.sources) ? doc.sources.slice() : [];
  const known = new Set(sources.map((s) => s.id));

  // 兼容：provider json 里直接写了 observed_endpoint 的，自动并入清单
  for (const p of providers) {
    if (known.has(p.id) || p.demo === true) continue; // 演示站不参与抓取
    if (p.observed_endpoint || (p.pricing_url && /\/api\/pricing\/?$/.test(p.pricing_url))) {
      sources.push({
        id: p.id,
        name: p.name,
        homepage: p.homepage,
        pricing_url: p.observed_endpoint || p.pricing_url,
        enabled: true,
        origin: 'provider',
      });
      known.add(p.id);
    }
  }
  return sources;
}

function saveSources(sources) {
  writeJson(SOURCES_FILE, { as_of: new Date().toISOString().slice(0, 10), sources });
}

let sources = loadSources();

if (LIST) {
  if (!sources.length) {
    console.log('还没有站点。加一个：node scripts/fetch-pricing.mjs --add https://站点域名');
    process.exit(0);
  }
  console.log('id                   启用  接口                    名称');
  for (const s of sources) {
    console.log(
      `${s.id.padEnd(20)} ${(s.enabled ? '✓' : '·').padEnd(5)} ${String(s.pricing_url || '(自动发现)').slice(0, 23).padEnd(24)} ${s.name || ''}`
    );
  }
  process.exit(0);
}

/* ---------- --add：发现接口 + 立刻抓一次 ---------- */
if (ADD) {
  const origin = normalizeOrigin(ADD);
  if (!origin) {
    console.error(`不是合法地址：${ADD}`);
    process.exit(2);
  }
  const id = opt('--id') || new URL(origin).hostname.replace(/^www\./, '').replace(/\./g, '-');
  if (sources.some((s) => s.id === id)) {
    console.error(`站点 id 已存在：${id}（用 --id 指定别的名字）`);
    process.exit(2);
  }
  console.log(`发现 ${origin} 的定价接口 …`);
  const found = await discoverPricing(origin, { timeout: TIMEOUT, retries: RETRIES });
  if (!found) {
    console.error(`✗ 没找到可用的 /api/pricing。\n  可能原因：不是 new-api/one-api 系、关闭了该接口、或被 Cloudflare 拦了。\n  这种情况只能在 data/providers/<id>.json 里人工录入价格。`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = parsePricing(found.payload, { resolveModel });
  } catch (err) {
    console.error(`✗ 接口找到了（${found.url}），但解析失败：${err.message}`);
    process.exit(1);
  }
  sources.push({
    id,
    name: opt('--name') || new URL(origin).hostname,
    homepage: origin,
    pricing_url: found.url,
    enabled: true,
    added_at: new Date().toISOString().slice(0, 10),
  });
  saveSources(sources);
  console.log(`✓ 已加入 data/sources.json：${id}  →  ${found.url}`);
  console.log(`  HTTP ${found.status} · ${found.ms}ms · 匹配 ${parsed.stats.matched}/${parsed.stats.total} 个模型`);
  await handleOne({ id, name: opt('--name') || id, homepage: origin, pricing_url: found.url }, { payload: found.payload, status: found.status, ms: found.ms, url: found.url });
  writeIndex();
  process.exit(0);
}

/* ---------- 正常抓取 ---------- */
const targets = sources
  .filter((s) => s.enabled !== false)
  .filter((s) => !s.only_if_provider || providers.some((p) => p.id === s.id))
  .filter((s) => !ONLY || s.id === ONLY);

if (!targets.length) {
  console.log(
    sources.length
      ? `没有启用中的站点（共 ${sources.length} 个）。用 --list 查看，或在 data/sources.json 里把 enabled 设为 true。`
      : '还没有站点。加一个：node scripts/fetch-pricing.mjs --add https://站点域名'
  );
  process.exit(0);
}

const results = await runPool(targets, (src) => handleOne(src), { concurrency: CONCURRENCY });
if (WRITE) writeIndex();

/* ---------- 汇总 ---------- */
const ok = results.filter((r) => r.ok && r.value?.ok);
const bad = results.filter((r) => !r.ok || !r.value?.ok);
const changes = ok.flatMap((r) => r.value.changes.map((c) => ({ station: r.value.id, ...c })));

console.log(`\n${'─'.repeat(62)}`);
console.log(`抓取完成：${ok.length} 成功 / ${bad.length} 失败 / 共 ${targets.length}`);
if (changes.length) {
  console.log(`\n价格变化（${changes.length}）：`);
  for (const c of changes) {
    const arrow = c.to > c.from ? '↑' : '↓';
    const sign = c.pct > 0 ? '+' : '';
    console.log(`  ${arrow} ${c.station}  ${c.id}.${c.field}  ${c.from} → ${c.to}  (${sign}${c.pct}%)`);
  }
} else if (ok.length) {
  console.log('\n价格无变化。');
}
if (bad.length) {
  console.log('\n失败站点：');
  for (const r of bad) {
    const id = r.value?.id || '(未知)';
    const msg = r.ok ? r.value.error : r.error?.message || String(r.error);
    console.log(`  ✗ ${id}  ${msg}`);
  }
}
console.log(DRY ? '\n（未落盘，加 --write 保存）' : `\n已写入 data/observed/ 与 data/price-history/`);
if (bad.length && !ok.length) process.exit(1);

/* ================= 单个站点 ================= */
async function handleOne(src, preset = null) {
  const base = { id: src.id, name: src.name, ok: false, changes: [] };
  try {
    let got = preset;
    let endpoint = src.pricing_url;

    if (!got) {
      if (FIXTURE) {
        got = { payload: JSON.parse(readFileSync(join(ROOT, FIXTURE), 'utf8')), status: 200, ms: 0, url: endpoint || 'fixture' };
      } else if (endpoint) {
        const r = await fetchJson(endpoint, { timeout: TIMEOUT, retries: RETRIES });
        got = { payload: r.json, status: r.status, ms: r.ms, url: endpoint };
      } else {
        const found = await discoverPricing(src.homepage, { timeout: TIMEOUT, retries: RETRIES });
        if (!found) throw new FetchError('没找到公开的 /api/pricing', { code: 'nodiscovery' });
        endpoint = found.url;
        got = found;
      }
    }

    const parsed = parsePricing(got.payload, { resolveModel });
    const snapshot = {
      station_id: src.id,
      endpoint: endpoint || got.url,
      fetched_at: new Date().toISOString(),
      http_status: got.status ?? null,
      latency_ms: got.ms ?? null,
      assumption: 'face_value_1cny_per_usd',
      parser: parsed.format,
      group_ratio: parsed.groupRatio,
      stats: parsed.stats,
      models: parsed.models,
      unmatched: parsed.unmatched.slice(0, 50),
    };

    const prev = lastSnapshot(src.id);
    const changes = prev ? diffSnapshots(prev, snapshot) : null;
    const changeList = changes
      ? [
          ...changes.added.map((id) => ({ id, field: 'new', from: null, to: snapshot.models[id].input, pct: null })),
          ...changes.changed,
        ]
      : [];

    // 终端报告
    const head = `✓ ${src.id.padEnd(16)} HTTP ${String(got.status ?? '-').padEnd(3)} ${String(got.ms ?? 0).padStart(5)}ms  模型 ${parsed.stats.matched}/${parsed.stats.total}`;
    console.log(head);
    if (parsed.stats.matched === 0) {
      console.log(`   模型名对不上：${parsed.unmatched.slice(0, 5).map((u) => u.model_name).join(', ') || '(无)'}`);
      console.log('   → 在 data/models.json 的 aliases 里补上这些名字');
    }
    if (changes) {
      if (changes.added.length) console.log(`   新增模型：${changes.added.join(', ')}`);
      if (changes.removed.length) console.log(`   下线模型：${changes.removed.join(', ')}`);
      for (const c of changes.changed) {
        console.log(`   ${c.to > c.from ? '↑ 涨价' : '↓ 降价'} ${c.id}.${c.field} ${c.from} → ${c.to} (${c.pct > 0 ? '+' : ''}${c.pct}%)`);
      }
    }

    if (WRITE) {
      mkdirSync(HISTORY, { recursive: true });
      writeJson(join(OBSERVED, `${src.id}.json`), snapshot);
      appendFileSync(
        join(HISTORY, `${src.id}.jsonl`),
        JSON.stringify({ t: snapshot.fetched_at, http: snapshot.http_status, models: flatten(snapshot.models) }) + '\n',
        'utf8'
      );
    }

    return { ...base, ok: true, http: got.status, matched: parsed.stats.matched, total: parsed.stats.total, changes: changeList };
  } catch (err) {
    const msg = explain(err);
    console.log(`✗ ${src.id.padEnd(16)} ${msg}`);
    return { ...base, error: msg };
  }
}

function flatten(modelsObj) {
  const out = {};
  for (const [id, m] of Object.entries(modelsObj)) out[id] = [m.input, m.output];
  return out;
}

/** 读最近一次快照（来自 price-history 的最后一行，没有就退回 observed/<id>.json） */
function lastSnapshot(id) {
  const hist = join(HISTORY, `${id}.jsonl`);
  if (existsSync(hist)) {
    const lines = readFileSync(hist, 'utf8').trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1];
    try {
      const rec = JSON.parse(last);
      const m = {};
      for (const [k, v] of Object.entries(rec.models || {})) m[k] = { input: v[0], output: v[1], cache_read: null };
      if (Object.keys(m).length) return { models: m };
    } catch {
      /* 坏行忽略 */
    }
  }
  const file = join(OBSERVED, `${id}.json`);
  if (existsSync(file)) {
    try {
      return readJson(file);
    } catch {
      return null;
    }
  }
  return null;
}

function writeIndex() {
  const files = listJson(OBSERVED).filter((f) => !f.endsWith('index.json'));
  const stations = files.map((f) => {
    const o = readJson(f);
    return {
      id: o.station_id,
      endpoint: o.endpoint,
      fetched_at: o.fetched_at,
      http_status: o.http_status,
      latency_ms: o.latency_ms,
      matched: o.stats?.matched ?? Object.keys(o.models || {}).length,
    };
  });
  stations.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  writeJson(join(OBSERVED, 'index.json'), { updated_at: new Date().toISOString(), stations });
}

/** 把失败原因翻译成人话 + 下一步该干嘛 */
function explain(err) {
  if (err instanceof FetchError) {
    if (err.status === 403) return 'HTTP 403 · 被 Cloudflare 人机验证拦了，抓不到（人工录入）';
    if (err.status === 404) return 'HTTP 404 · 该站不提供公开 /api/pricing（人工录入）';
    if (err.code === 'timeout') return `超时 · ${err.message}`;
    if (err.code === 'nodiscovery') return '没找到公开 /api/pricing（人工录入）';
    return `${err.code} · ${err.message}`;
  }
  return err?.message || String(err);
}
