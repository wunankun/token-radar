#!/usr/bin/env node
// 抓美元兑人民币汇率，写回 config.json 的 fx。
// 三个源依次尝试，都失败就保留旧值并以非零码退出（--strict 时才让 CI 失败）。
// 用法：node scripts/fetch-fx.mjs [--dry] [--strict]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'config.json');
const UA = 'token-radar/1.0 (+https://github.com/wunankun/token-radar)';

const SOURCES = [
  {
    name: 'fawazahmed0/currency-api',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    pick: (j) => ({ rate: j?.usd?.cny, as_of: j?.date }),
    doc: 'https://github.com/fawazahmed0/exchange-api',
  },
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    pick: (j) => ({
      rate: j?.rates?.CNY,
      as_of: j?.time_last_update_utc ? new Date(j.time_last_update_utc).toISOString().slice(0, 10) : null,
    }),
    doc: 'https://www.exchangerate-api.com/docs/free',
  },
  {
    name: 'frankfurter.app',
    url: 'https://api.frankfurter.app/latest?from=USD&to=CNY',
    pick: (j) => ({ rate: j?.rates?.CNY, as_of: j?.date }),
    doc: 'https://www.frankfurter.app/docs',
  },
];

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const strict = argv.includes('--strict');

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const prev = config.fx || {};

async function tryOne(src) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(src.url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('返回的不是 JSON');
    }
    const picked = src.pick(json);
    const rate = Number(picked.rate);
    if (!Number.isFinite(rate) || rate < 5 || rate > 12) throw new Error(`汇率不合理：${picked.rate}`);
    return { rate, as_of: picked.as_of || new Date().toISOString().slice(0, 10), source: src.name };
  } finally {
    clearTimeout(timer);
  }
}

let got = null;
const failures = [];
for (const src of SOURCES) {
  try {
    got = await tryOne(src);
    break;
  } catch (err) {
    failures.push(`${src.name}: ${err.message}`);
  }
}

if (!got) {
  console.error('❌ 汇率抓取失败，保留旧值：');
  failures.forEach((f) => console.error('   · ' + f));
  console.error(`   旧值 USD→CNY = ${prev.usd_cny ?? '(无)'}`);
  process.exit(strict ? 1 : 0);
}

const next = {
  usd_cny: Math.round(got.rate * 10000) / 10000,
  as_of: got.as_of,
  source: got.source,
  fetched_at: new Date().toISOString(),
};

if (dry) {
  console.log(JSON.stringify(next, null, 2));
} else {
  config.fx = next;
  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
  const delta = prev.usd_cny ? (next.usd_cny - prev.usd_cny) / prev.usd_cny : 0;
  console.log(
    `💱 USD→CNY ${next.usd_cny}（${next.as_of}，${next.source}）` +
      (prev.usd_cny ? `，上次 ${prev.usd_cny}（${(delta * 100).toFixed(2)}%）` : '') +
      (failures.length ? `；前面的源失败 ${failures.length} 个` : ''),
  );
}
