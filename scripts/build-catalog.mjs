#!/usr/bin/env node
/**
 * 把 data/catalog/ 里的全量模型（每个站的真实供给）汇总成一份模型注册表。
 *
 *   node scripts/build-catalog.mjs             # 生成 data/models-auto.json + dist/catalog.json
 *   node scripts/build-catalog.mjs --min 5     # 只留被 ≥5 家站收录的模型（默认 3）
 *
 * 为什么要有它：data/models.json 只有 6 个人工核验的模型，而 63 家站一共卖 3000+ 个
 * 不同的模型名。这里把它们归一成「家族」（去掉日期后缀、:free、-healthcare 之类的变体），
 * 按被多少家站收录排序，并给每个家族找基准价：
 *   1. data/official.json（人工核实过的官方价，最可信）
 *   2. data/openrouter-models.json（OpenRouter 的公开价，当参照价）
 *   3. 都没有 → 只列绝对价，不算优惠力度
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DATA, DIST, readJson, writeJson, ensureDir } from './lib/io.mjs';

const argv = process.argv.slice(2);
const MIN = Number((argv.find((a) => a.startsWith('--min')) || '').split('=')[1] || argv[argv.indexOf('--min') + 1]) || 3;

/* ---------- 归一化 ---------- */
const VENDOR_PREFIX = /^(openai|anthropic|google|deepseek|zhipu|xai|x-ai|moonshot|qwen|alibaba|bytedance|meta|mistral|cohere|perplexity)\//;

export function familyOf(raw) {
  let n = String(raw || '').toLowerCase().trim();
  n = n.replace(VENDOR_PREFIX, '');
  n = n.replace(/@[a-z0-9-]+$/, '');          // gemini-2.5-pro@preview
  n = n.replace(/:[a-z0-9-]+$/, '');          // :free / :thinking
  n = n.replace(/[-_]20\d{2}[-_]?\d{2}[-_]?\d{2}$/, ''); // -2024-10-22
  n = n.replace(/[-_](healthcare|law|cyber|preview|latest|free|beta|exp)$/, '');
  n = n.replace(/[-_](think|thinking)$/, '');
  n = n.replace(/[_-]+/g, '-').replace(/^-|-$/g, '');
  return n;
}

const VENDORS = [
  [/^(gpt|o[1-4](?![0-9])|codex|chatgpt)/, 'OpenAI'],
  [/^claude/, 'Anthropic'],
  [/^gemini/, 'Google'],
  [/^deepseek/, 'DeepSeek'],
  [/^(kimi|moonshot)/, 'Moonshot'],
  [/^grok/, 'xAI'],
  [/^(qwen|qwq|qvq)/, 'Alibaba'],
  [/^(glm|chatglm|zhipu)/, 'Zhipu'],
  [/^(doubao|seedance|seedream|kling)/, 'ByteDance'],
  [/^(llama|meta-llama)/, 'Meta'],
  [/^mistral/, 'Mistral'],
  [/^(glm|ernie|hunyuan|minimax|step|baichuan|yi-)/, '国产'],
];

export function vendorOf(id) {
  for (const [re, v] of VENDORS) if (re.test(id)) return v;
  return '其他';
}

const CAP = { gpt: 'GPT', glm: 'GLM', 'x-ai': 'xAI', ai: 'AI', api: 'API', vl: 'VL', tts: 'TTS', stt: 'STT', ocr: 'OCR', v4: 'V4', v3: 'V3' };

export function labelOf(id) {
  const tokens = id.split('-').filter(Boolean);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d+(\.\d+)?$/.test(t)) {
      // 连续数字段用 . 连接：5-5 → 5.5；4-8 → 4.8（模型版本号）
      let n = t;
      while (i + 1 < tokens.length && /^\d+(\.\d+)?$/.test(tokens[i + 1])) n += `.${tokens[++i]}`;
      const prev = out[out.length - 1];
      if (prev && /[A-Za-z0-9]$/.test(prev) && !/[0-9.]$/.test(prev)) out[out.length - 1] = prev.endsWith(' ') ? prev + n : prev + ' ' + n;
      else if (prev && /^[A-Za-z]/.test(prev)) out[out.length - 1] = prev + ' ' + n;
      else out.push(n);
      continue;
    }
    out.push(CAP[t] || (t.length <= 2 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1)));
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/* ---------- 读数据 ---------- */
const blobs = {};
for (const f of ['catalog'].map((d) => join(DATA, d))) {
  if (!existsSync(f)) continue;
  for (const file of readdirSync(f).filter((x) => x.endsWith('.json'))) {
    const j = readJson(join(f, file), null);
    if (j?.models) blobs[j.station_id] = j;
  }
}

const official = readJson(join(DATA, 'official.json'), { providers: [] });
const officialUsd = new Map();
for (const p of official.providers || []) {
  for (const [id, m] of Object.entries(p.models || {})) {
    if (m?.input != null) officialUsd.set(familyOf(id), { input: m.input, output: m.output, cache_read: m.cache_read ?? null, source: 'official', vendor: p.id });
  }
}

const or = readJson(join(DATA, 'openrouter-models.json'), { models: [] });
const orUsd = new Map();
for (const m of or.models || []) {
  const fam = familyOf(String(m.id || '').split('/').pop());
  if (!fam || orUsd.has(fam)) continue;
  orUsd.set(fam, { input: m.input, output: m.output, cache_read: null, source: 'openrouter', openrouter_id: m.id });
}

/* ---------- 统计家族 ---------- */
const fams = new Map(); // id → { stations:Set, names:Map(name→count), entries:[] }
for (const [stationId, blob] of Object.entries(blobs)) {
  for (const m of blob.models) {
    const fam = familyOf(m.n);
    if (!fam || fam.length < 2) continue;
    let rec = fams.get(fam);
    if (!rec) fams.set(fam, (rec = { stations: new Set(), names: new Map(), samples: [] }));
    rec.stations.add(stationId);
    rec.names.set(m.n, (rec.names.get(m.n) || 0) + 1);
    if (rec.samples.length < 3) rec.samples.push(m.n);
  }
}

const list = [];
for (const [id, rec] of fams) {
  if (rec.stations.size < MIN) continue;
  const base = officialUsd.get(id) || orUsd.get(id) || null;
  list.push({
    id,
    label: labelOf(id),
    vendor: (officialUsd.get(id)?.vendor ? vendorOf(id) : vendorOf(id)) || '其他',
    coverage: rec.stations.size,
    names: [...rec.names.keys()].slice(0, 6),
    baseline: base
      ? {
          input: base.input,
          output: base.output,
          cache_read: base.cache_read ?? null,
          source: base.source,
        }
      : null,
  });
}

list.sort((a, b) => b.coverage - a.coverage || a.id.localeCompare(b.id));

const bySource = list.reduce((acc, m) => {
  const k = m.baseline ? m.baseline.source : 'none';
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});

writeJson(join(DATA, 'models-auto.json'), {
  generated_at: new Date().toISOString(),
  threshold: MIN,
  stations: Object.keys(blobs).length,
  total_families: fams.size,
  count: list.length,
  baseline: bySource,
  models: list,
});

/* ---------- 给前端的按模型查价表 ---------- */
const byModel = {};
for (const m of list) {
  const rows = [];
  for (const [stationId, blob] of Object.entries(blobs)) {
    const hits = blob.models.filter((x) => familyOf(x.n) === m.id);
    if (!hits.length) continue;
    // 同一家族可能有多条（gpt-6.2-sol 和 gpt-6.2-sol-healthcare），取最便宜的那条
    let best = null;
    for (const h of hits) {
      const input = h.r * 2 * (h.g > 0 ? h.g : blob.group_ratio || 1);
      const output = input * (h.c || 1);
      if (!best || input < best[1]) best = [h.n, input, output, h.cr != null ? input * h.cr : null];
    }
    rows.push([stationId, ...best]);
  }
  rows.sort((a, b) => a[2] - b[2]);
  byModel[m.id] = rows;
}

ensureDir(DIST);
const packed = {};
for (const m of list) {
  packed[m.id] = {
    l: m.label,
    v: m.vendor,
    n: m.coverage,
    b: m.baseline ? [m.baseline.input, m.baseline.output, m.baseline.source] : null,
    r: byModel[m.id] || [],
  };
}
writeJson(join(DIST, 'catalog.json'), {
  generated_at: new Date().toISOString(),
  note: '价格单位：美元/百万 token（站上面值，按各站默认分组倍率，未再按汇率折算）；b = 参照价 [输入, 输出, 来源]。',
  count: list.length,
  models: packed,
});

console.log(`模型目录：${Object.keys(blobs).length} 家站 · ${fams.size} 个家族 · 收录 ≥${MIN} 家的 ${list.length} 个`);
console.log(`  基准价来源：官方 ${bySource.official || 0} 个 · OpenRouter ${bySource.openrouter || 0} 个 · 无基准 ${bySource.none || 0} 个`);
console.log(`  最多的模型：${list.slice(0, 6).map((m) => `${m.label}(${m.coverage})`).join(' · ')}`);
