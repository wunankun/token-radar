#!/usr/bin/env node
/**
 * 抓取链路自检：起一个本地假站点（模拟 new-api 的 /api/pricing），跑两轮抓取，
 * 第二轮改价，用来验证「发现接口 → 解析 → 记账 → 对比出涨跌」整条路径。
 *
 *   node scripts/demo-crawl.mjs
 *
 * 不联网、不写 data/，产物落在 .preview/demo-crawl/（已被 .gitignore 忽略）。
 */
import http from 'node:http';
import { once } from 'node:events';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffSnapshots, discoverPricing, parsePricing } from './lib/crawl.mjs';
import { readJson } from './lib/io.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.preview', 'demo-crawl');
mkdirSync(OUT, { recursive: true });

const models = readJson(join(ROOT, 'data', 'models.json'));
const aliasToId = new Map();
for (const [id, m] of Object.entries(models)) {
  aliasToId.set(id.toLowerCase(), id);
  for (const a of m.aliases || []) aliasToId.set(String(a).toLowerCase(), id);
}
const resolveModel = (n) => aliasToId.get(String(n).toLowerCase()) || null;

/** 站上的价格表（model_ratio 是 one-api 面值：USD/百万 = ratio × 2 × group_ratio） */
let prices = [
  { model_name: 'gpt-6.2-sol', model_ratio: 1, completion_ratio: 5, cache_ratio: 0.1 },
  { model_name: 'claude-3-5-sonnet-20241022', model_ratio: 1, completion_ratio: 5 },
  { model_name: 'deepseek-v4-pro', model_ratio: 0.66, completion_ratio: 3 },
  { model_name: 'some-image-model', model_ratio: 0, model_price: 0.04, quota_type: 1 },
  { model_name: 'unmapped-model-xyz', model_ratio: 2, completion_ratio: 2 },
];

const server = http.createServer((req, res) => {
  if (req.url === '/api/pricing') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ success: true, group_ratio: { default: 0.9 }, data: prices }));
  }
  res.writeHead(404, { 'content-type': 'text/html' });
  res.end('<html>not found</html>');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

console.log(`假站点已启动：${base}\n`);

async function crawlRound(label) {
  const found = await discoverPricing(base, { retries: 0 });
  if (!found) throw new Error('没能发现定价接口');
  const parsed = parsePricing(found.payload, { resolveModel });

  const snapshot = {
    station_id: 'demo-mock',
    endpoint: found.url,
    fetched_at: new Date().toISOString(),
    http_status: found.status,
    latency_ms: found.ms,
    assumption: 'face_value_1cny_per_usd',
    parser: parsed.format,
    group_ratio: parsed.groupRatio,
    stats: parsed.stats,
    models: parsed.models,
    unmatched: parsed.unmatched,
  };

  const histFile = join(OUT, 'demo-mock.jsonl');
  const prev = existsSync(histFile)
    ? (() => {
        const lines = readFileSync(histFile, 'utf8').trim().split('\n').filter(Boolean);
        const last = JSON.parse(lines[lines.length - 1]);
        const m = {};
        for (const [k, v] of Object.entries(last.models)) m[k] = { input: v[0], output: v[1], cache_read: null };
        return { models: m };
      })()
    : null;

  const diff = prev ? diffSnapshots(prev, snapshot) : null;

  console.log(`── ${label} ──`);
  console.log(`发现接口  ${found.url}   HTTP ${found.status}`);
  console.log(`解析      ${parsed.stats.matched}/${parsed.stats.total} 个模型匹配（按次计费跳过 ${parsed.stats.per_call}，未匹配 ${parsed.unmatched.length}：${parsed.unmatched.map((u) => u.model_name).join(', ') || '无'}）`);
  for (const [id, m] of Object.entries(parsed.models)) {
    console.log(`  ${id.padEnd(22)} $${String(m.input).padEnd(7)} / $${String(m.output).padEnd(7)} 百万 token`);
  }
  if (diff) {
    if (diff.added.length) console.log(`  新增：${diff.added.join(', ')}`);
    if (diff.removed.length) console.log(`  下线：${diff.removed.join(', ')}`);
    for (const c of diff.changed) {
      console.log(`  ${c.to > c.from ? '↑ 涨价' : '↓ 降价'} ${c.id}.${c.field} ${c.from} → ${c.to}（${c.pct > 0 ? '+' : ''}${c.pct}%）`);
    }
    if (!diff.added.length && !diff.removed.length && !diff.changed.length) console.log('  价格无变化');
  }

  appendFileSync(histFile, JSON.stringify({ t: snapshot.fetched_at, http: snapshot.http_status, models: Object.fromEntries(Object.entries(parsed.models).map(([k, v]) => [k, [v.input, v.output]])) }) + '\n');
  writeFileSync(join(OUT, 'latest.json'), JSON.stringify(snapshot, null, 2) + '\n');
  console.log('');
}

await crawlRound('第 1 轮：初始价格');

// 改价：GPT 涨价 20%、Sonnet 降价、DeepSeek 下线、新增一个模型
prices = [
  { model_name: 'gpt-6.2-sol', model_ratio: 1.2, completion_ratio: 5, cache_ratio: 0.1 },
  { model_name: 'claude-3-5-sonnet-20241022', model_ratio: 0.8, completion_ratio: 5 },
  { model_name: 'gpt-6.2-astra', model_ratio: 4, completion_ratio: 5 },
  { model_name: 'some-image-model', model_ratio: 0, model_price: 0.05, quota_type: 1 },
];
console.log('（站点改了价：GPT 涨价、Sonnet 降价、DeepSeek 下线、新增 Astra）\n');

await crawlRound('第 2 轮：改价后');

server.closeAllConnections?.();
server.close();
console.log(`产物：${OUT}/demo-mock.jsonl（历史）、latest.json（最新快照）`);
