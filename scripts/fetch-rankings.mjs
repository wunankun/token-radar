#!/usr/bin/env node
// 抓 OpenRouter 的 LLM Rankings（按一周内实际处理的 token 数排名），
// 作为「模型消耗排行」的权威外部口径。
//
//   node scripts/fetch-rankings.mjs            # 干跑，打印前 20
//   node scripts/fetch-rankings.mjs --write    # 写 data/rankings.json
//
// 数据来自页面内联的 Next.js 脱水缓存（queryKey: ["rankings","models",{"view":"week"}]），
// 每个模型一条 {date, model_permaslug, total_prompt_tokens, total_completion_tokens}。
// 页面结构变了就只会少抓、不会写错——parse 出来少于 5 条时直接失败。

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { DATA, readJson } from './lib/io.mjs';

const URL = 'https://openrouter.ai/rankings';
const UA = 'token-radar/1.0 (+https://github.com/wunankun/token-radar)';

export function parseRankings(html, view = 'week') {
  // 页面把 JSON 塞在 self.__next_f.push 里，引号是转义过的
  const body = html.replace(/\\"/g, '"');
  const re =
    /\{"date":"([^"]+)","model_permaslug":"([^"]+)"[\s\S]{0,400}?"total_completion_tokens":(\d+),"total_prompt_tokens":(\d+)/g;
  const bySlug = new Map();
  let m;
  while ((m = re.exec(body))) {
    const [, date, slug, comp, prompt] = m;
    const cur = bySlug.get(slug) || { slug, tokens: 0, date };
    cur.tokens += Number(prompt) + Number(comp);
    cur.date = date;
    bySlug.set(slug, cur);
  }
  const models = [...bySlug.values()]
    .filter((x) => x.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .map((x, i) => ({ rank: i + 1, slug: x.slug, tokens: x.tokens }));
  return { models, dates: [...new Set([...bySlug.values()].map((x) => x.date))] };
}

// 本机 node 的 TLS 偶尔连不上 openrouter，退回 curl（CI 上两者都能用）
async function getHtml() {
  try {
    const res = await fetch(URL, { headers: { 'user-agent': UA, accept: 'text/html' } });
    if (res.ok) return await res.text();
  } catch {
    /* 落到 curl */
  }
  return execFileSync('curl', ['-sL', '--max-time', '40', '-A', UA, URL], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const view = (args.find((a) => a.startsWith('--view=')) || '--view=week').split('=')[1];

  const html = await getHtml();
  const parsed = parseRankings(html, view);

  if (parsed.models.length < 5) {
    throw new Error(`只解析出 ${parsed.models.length} 个模型，页面结构可能变了`);
  }

  const asOf = parsed.dates.sort().pop() || new Date().toISOString().slice(0, 10);
  const payload = {
    _help:
      'OpenRouter 的 LLM Rankings（一周内实际处理的 token 数）。build 时用它算模型消耗排行；没上榜的模型排在后面，按 data/models.json 里的顺序。',
    source: 'openrouter-rankings',
    source_name: 'OpenRouter · LLM Rankings',
    url: URL,
    view,
    as_of: asOf.slice(0, 10),
    models: parsed.models.slice(0, 80),
  };

  if (!write) {
    console.log(`OpenRouter 排行（${view}，${payload.as_of}）：${payload.models.length} 个模型`);
    for (const x of payload.models.slice(0, 20)) {
      console.log(`${String(x.rank).padStart(3)}  ${(x.tokens / 1e12).toFixed(2)}T  ${x.slug}`);
    }
    const old = readJson(join(DATA, 'rankings.json'), null);
    if (old && old.as_of) console.log(`\n现有 data/rankings.json：${old.as_of}，${old.models.length} 个`);
    console.log('\n加 --write 写回 data/rankings.json');
    return;
  }

  writeFileSync(join(DATA, 'rankings.json'), JSON.stringify(payload, null, 2) + '\n');
  console.log(`已写 data/rankings.json：${payload.models.length} 个模型（${payload.as_of}）`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
