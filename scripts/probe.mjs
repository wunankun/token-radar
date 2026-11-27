#!/usr/bin/env node
/**
 * 探活 + 指纹抽检 + 计费系数实测。
 *
 *   密钥（两种任选）：
 *     a) PROBE_KEYS = {"my-station":"sk-xxx","another":"sk-yyy"}   ← 推荐，一个 secret 管全部
 *     b) PROBE_KEY_<站点ID大写，非字母数字换下划线>，例如 PROBE_KEY_MY_STATION
 *   站点侧配置（data/providers/<id>.json）：
 *         "probe": { "base_url": "https://api.example.com/v1", "model": "claude-sonnet-5-5" }
 *
 *   node scripts/probe.mjs             # 全部有 key 的站点
 *   node scripts/probe.mjs --only ai-beehears-com --dry
 *
 * 不做的事：不存 key、不打印 key、失败只记录状态。
 */
import { loadAll, readJson, writeJson, DATA } from './lib/io.mjs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const ONLY = opt('--only');
const DRY = flag('--dry');
const { models, providers } = loadAll();

let KEYS = {};
try {
  KEYS = JSON.parse(process.env.PROBE_KEYS || '{}');
} catch {
  console.warn('PROBE_KEYS 不是合法 JSON，已忽略');
}
const keyFor = (id) =>
  KEYS[id] || process.env['PROBE_KEY_' + id.toUpperCase().replace(/[^A-Z0-9]/g, '_')] || null;

/** 5 道确定性小题：答对说明这条链路没被换成一个「便宜模型」在瞎答 */
const FINGERPRINT = [
  { q: 'Reply with exactly one word: ready', expect: 'ready' },
  { q: 'What is 17*3? Reply with the number only.', expect: '51' },
  { q: 'What is the capital of France? One word.', expect: 'paris' },
  { q: 'Repeat this string exactly: tR-9f2Q', expect: 'tr-9f2q' },
  { q: 'Is 91 a prime number? Answer yes or no.', expect: 'no' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function chat(base, key, model, content, maxTokens = 16) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        'user-agent': 'token-radar-probe/1.0',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        max_tokens: maxTokens,
        temperature: 0,
      }),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* 有的站直接返回 HTML 错误页 */
    }
    const latency = Date.now() - started;
    if (!res.ok) {
      return { ok: false, latency, error: `HTTP ${res.status} ${(json?.error?.message || text.slice(0, 120)).replace(/\s+/g, ' ')}` };
    }
    const reply = json?.choices?.[0]?.message?.content ?? '';
    return { ok: true, latency, reply: String(reply).trim(), usage: json?.usage || null };
  } catch (err) {
    return { ok: false, latency: Date.now() - started, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** 粗估 prompt token：ASCII 约 4 字符/token，中文约 1.5 字符/token */
function estimateTokens(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return Math.max(1, (text.length - cjk) / 4 + cjk / 1.5);
}

const targets = providers.filter(
  (p) => p.kind !== 'official' && p.probe?.base_url && keyFor(p.id) && (!ONLY || p.id === ONLY),
);

if (!targets.length) {
  console.log('没有可探活的站点：需要在 provider json 里写 probe.base_url，并配置对应的 PROBE_KEY_* 环境变量');
  process.exit(0);
}

for (const p of targets) {
  const key = keyFor(p.id);
  const base = p.probe.base_url;
  const modelId = p.probe.model || Object.keys(p.models || {})[0];
  const model = models[modelId]?.official?.model || modelId;

  console.log(`\n▸ ${p.id}  (${modelId})`);
  const results = [];
  for (const [i, item] of FINGERPRINT.entries()) {
    if (i) await sleep(1200);
    const r = await chat(base, key, model, item.q);
    results.push(r);
    if (!r.ok) console.log(`  ✗ 第 ${i + 1} 题失败：${r.error}`);
  }

  const okCount = results.filter((r) => r.ok).length;
  const passed = results.filter((r, i) => r.ok && r.reply.toLowerCase().replace(/[.!。\s]/g, '').includes(FINGERPRINT[i].expect)).length;

  const usages = [];
  results.forEach((r, i) => {
    if (r.ok && r.usage?.prompt_tokens && FINGERPRINT[i]) {
      usages.push(r.usage.prompt_tokens / estimateTokens(FINGERPRINT[i].q));
    }
  });
  const usageRatio = usages.length ? Math.round((usages.reduce((a, b) => a + b, 0) / usages.length) * 100) / 100 : null;

  const okLat = results.filter((r) => r.ok).map((r) => r.latency).sort((a, b) => a - b);
  const latency = okLat.length ? Math.round(okLat[Math.floor(okLat.length / 2)]) : null;

  console.log(`  可用 ${okCount}/${FINGERPRINT.length}，指纹通过 ${passed}/${FINGERPRINT.length}，中位延迟 ${latency ?? '—'}ms，计费系数 ${usageRatio ?? '—'}`);

  if (DRY) continue;

  const today = new Date().toISOString().slice(0, 10);
  const file = join(DATA, 'health', `${p.id}.json`);
  const doc = existsSync(file) ? readJson(file, { days: [] }) : { station_id: p.id, days: [] };
  doc.days = (doc.days || []).filter((d) => d.date !== today);
  doc.days.push({
    date: today,
    ok: okCount > 0 && passed >= 3,
    latency_ms: latency,
    usage_ratio: usageRatio,
    fingerprint_pass: passed,
    fingerprint_total: FINGERPRINT.length,
    http_ok: okCount,
  });
  doc.days.sort((a, b) => (a.date < b.date ? 1 : -1));
  doc.last_error = results.find((r) => !r.ok)?.error ?? null;
  writeJson(file, doc);
  console.log(`   → data/health/${p.id}.json`);
}
