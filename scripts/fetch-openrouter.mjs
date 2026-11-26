#!/usr/bin/env node
/**
 * 抓 OpenRouter 的公开模型价目表，当作「官方价的外部对照」。
 *
 *   node scripts/fetch-openrouter.mjs           # 只打印
 *   node scripts/fetch-openrouter.mjs --write   # 写 data/observed/openrouter.json
 *
 * OpenRouter 的 pricing 是「每 token 美元价」，乘 1e6 换成「每百万 token」。
 * 它不覆盖全部官方模型（Anthropic 的 Claude 系就不在里面），所以只能做对照，不能当官方价用。
 */
import { loadAll, writeJson, DATA } from './lib/io.mjs';
import { fetchJson } from './lib/crawl.mjs';
import { join } from 'node:path';

const WRITE = process.argv.includes('--write');
const URL = 'https://openrouter.ai/api/v1/models';

const { models } = loadAll();
const alias = new Map();
for (const [id, m] of Object.entries(models)) {
  for (const a of [id, ...(m.aliases || [])]) alias.set(String(a).toLowerCase(), id);
}

const res = await fetchJson(URL, { timeout: 30000, retries: 2 });
const list = Array.isArray(res.json?.data) ? res.json.data : [];

const found = {};
for (const item of list) {
  const pricing = item.pricing || {};
  const input = Number(pricing.prompt) * 1e6;
  const output = Number(pricing.completion) * 1e6;
  if (!Number.isFinite(input) || (input <= 0 && output <= 0)) continue;

  // openrouter 的 id 形如 deepseek/deepseek-v4-pro，按最后一段和历史别名匹配
  const tail = String(item.id || '').split('/').pop().toLowerCase();
  const id = alias.get(tail) || alias.get(String(item.id || '').toLowerCase());
  if (!id || found[id]) continue;
  found[id] = {
    openrouter_id: item.id,
    name: item.name,
    input: Math.round(input * 1e4) / 1e4,
    output: Math.round(output * 1e4) / 1e4,
    cache_read: Number(pricing.input_cache_read) > 0 ? Math.round(Number(pricing.input_cache_read) * 1e10) / 1e4 : null,
  };
}

console.log(`OpenRouter 返回 ${list.length} 个模型，命中我们关注的 ${Object.keys(found).length} 个`);
for (const [id, v] of Object.entries(found)) console.log(`  ${id.padEnd(18)} $${v.input}/${v.output}  (${v.openrouter_id})`);

if (WRITE) {
  writeJson(join(DATA, 'observed', 'openrouter.json'), {
    station_id: 'openrouter',
    kind: 'aggregator',
    endpoint: URL,
    fetched_at: new Date().toISOString(),
    http_status: res.status,
    latency_ms: res.ms,
    assumption: 'usd_per_million',
    models: found,
  });
  console.log('已写入 data/observed/openrouter.json');
}
