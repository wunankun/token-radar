#!/usr/bin/env node
/**
 * 校验 data/ 并生成静态站与 prices.json。
 *
 *   node scripts/build.mjs            # 正常构建
 *   node scripts/build.mjs --strict   # 有任何 warning 也失败（CI 用）
 */
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { loadAll, writeJson, DIST, ensureDir, loadHealth } from './lib/io.mjs';
import { KINDS, FLAGS, buildOfficialIndex, normalizeEntry, rechargeBonus, KIND_LABEL } from './lib/normalize.mjs';
import { renderSite } from './lib/render.mjs';

const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const { config, models, official, providers, observed } = loadAll();

/* ---------- config ---------- */
const fx = Number(config?.fx?.usd_cny);
if (!Number.isFinite(fx) || fx <= 0) err('config.json: fx.usd_cny 必须是正数');

/* ---------- official ---------- */
const { index: officialIndex, errors: offErr } = buildOfficialIndex(official);
offErr.forEach(err);

for (const modelId of Object.keys(models)) {
  if (!officialIndex.has(modelId)) warn(`models.json: ${modelId} 没有官方基准价，只能展示绝对价、无法算倍率`);
}

/* ---------- providers ---------- */
const seen = new Set();
const stations = [];

for (const p of providers) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id || '')) err(`站点 id 不合法（小写字母/数字/连字符）: ${p.id}`);
  if (seen.has(p.id)) err(`站点 id 重复: ${p.id}`);
  seen.add(p.id);

  if (!p.name) err(`${p.id}: 缺少 name`);
  if (!KINDS.includes(p.kind)) err(`${p.id}: kind 必须是 ${KINDS.join(' / ')}`);
  for (const f of p.risk_flags || []) if (!FLAGS.includes(f)) err(`${p.id}: 未知 risk_flag "${f}"`);

  if (p.affiliate) {
    if (!/^https?:\/\//.test(p.affiliate.url || '')) err(`${p.id}: affiliate.url 必须是 http(s) 链接`);
    if (p.affiliate.disclosure !== true) err(`${p.id}: 有推广链接就必须显式写 "disclosure": true（硬性规则）`);
    if (!p.affiliate.code) warn(`${p.id}: affiliate.code 为空，建议填邀请码方便核对`);
  }
  if (!p.demo && !p.pricing_url && p.kind !== 'official') warn(`${p.id}: 缺少 pricing_url，无法回溯价格来源`);

  if (p.kind === 'official') {
    const off = (official.providers || []).find((o) => o.id === p.official_source);
    if (!off) {
      err(`${p.id}: official_source "${p.official_source}" 在 official.json 里不存在`);
      continue;
    }
    for (const modelId of Object.keys(off.models || {})) {
      const model = models[modelId];
      if (!model) {
        err(`${p.id}: official.json 里的模型 ${modelId} 未在 models.json 登记`);
        continue;
      }
      const res = normalizeEntry({
        station: p,
        modelId,
        model,
        stationModel: null,
        official: officialIndex.get(modelId),
        fx,
        blend: config.blend,
        health: loadHealth(p.id),
        priceSource: 'official',
      });
      if (res.error) err(res.error);
      else stations.push(res.row);
    }
    continue;
  }

  // 中转站：人工价优先，其次自动抓取的 observed
  const obs = observed.get(p.id);
  const declared = p.models || {};
  const modelIds = new Set([...Object.keys(declared), ...Object.keys(obs?.models || {})]);

  if (!modelIds.size) warn(`${p.id}: 没有任何模型价格`);

  for (const modelId of modelIds) {
    const model = models[modelId];
    if (!model) {
      err(`${p.id}: 模型 ${modelId} 未在 data/models.json 登记`);
      continue;
    }
    const manual = declared[modelId];
    const auto = obs?.models?.[modelId];
    const stationModel = manual
      ? manual
      : auto
        ? { mode: 'absolute', input: auto.input, output: auto.output, cache_read: auto.cache_read }
        : null;
    if (!stationModel) continue;

    const res = normalizeEntry({
      station: p,
      modelId,
      model,
      stationModel,
      official: officialIndex.get(modelId),
      fx,
      blend: config.blend,
      health: loadHealth(p.id),
      priceSource: manual ? 'manual' : 'auto',
    });
    if (res.error) {
      if (manual) err(res.error);
      else warn(`${res.error}（自动抓取数据，已跳过）`);
      continue;
    }
    if (!manual) res.row.note = res.row.note || '价格来自站点公开 /api/pricing，未经人工核验';
    stations.push(res.row);
  }
}

/* ---------- sort ---------- */
const cmp = (a, b) => {
  const ra = a.ratio?.blend ?? Number.POSITIVE_INFINITY;
  const rb = b.ratio?.blend ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return (a.effective?.output ?? 1e9) - (b.effective?.output ?? 1e9);
};
stations.sort(cmp);

/* ---------- report ---------- */

// 「最低价」只在真实的中转站里选：官方行是基准，演示行不参与结论
const best = stations
  .filter((s) => !s.station.demo && s.station.kind !== 'official' && s.ratio.blend != null)
  .sort(cmp)[0] || null;
const officialRows = stations.filter((s) => s.station.kind === 'official');

const bestDemo = stations
  .filter((s) => s.station.demo && s.station.kind !== 'official' && s.ratio.blend != null)
  .sort(cmp)[0] || null;

const meta = {
  generated_at: new Date().toISOString(),
  fx: { usd_cny: fx, as_of: config.fx.as_of, source: config.fx.source },
  blend: config.blend,
  counts: {
    rows: stations.length,
    stations: new Set(stations.map((s) => s.station.id)).size,
    models: new Set(stations.map((s) => s.model.id)).size,
    official_rows: officialRows.length,
    demo_rows: stations.filter((s) => s.station.demo).length,
    with_affiliate: stations.filter((s) => s.station.affiliate_url).length,
  },
  best: best
    ? { station: best.station.name, model: best.model.label, ratio: best.ratio.blend, effective: best.effective }
    : null,
  best_demo: bestDemo
    ? { station: bestDemo.station.name, model: bestDemo.model.label, ratio: bestDemo.ratio.blend, effective: bestDemo.effective }
    : null,
  disclosure: config.disclosure,
  site: config.site,
};

ensureDir(DIST);
writeJson(join(DIST, 'prices.json'), { meta, rows: stations });

const html = renderSite({ meta, rows: stations, models, config });
writeFileSync(join(DIST, 'index.html'), html, 'utf8');

/* ---------- console ---------- */
console.log(`\nToken 雷达 · build`);
console.log(`  行数 ${meta.counts.rows} / 站点 ${meta.counts.stations} / 模型 ${meta.counts.models}`);
console.log(`  官方基准 ${meta.counts.official_rows} 行，演示 ${meta.counts.demo_rows} 行，带推广链接 ${meta.counts.with_affiliate} 行`);
if (best) console.log(`  当前最低：${best.station.name} · ${best.model.label} · ${(best.ratio.blend * 10).toFixed(1)} 折`);

if (warnings.length) {
  console.log(`\n⚠️  ${warnings.length} 条 warning`);
  for (const w of warnings) console.log('   - ' + w);
}

if (errors.length) {
  console.error(`\n❌ ${errors.length} 条 error`);
  for (const e of errors) console.error('   - ' + e);
  process.exit(1);
}

if (STRICT && warnings.length) {
  console.error('\n--strict：存在 warning，构建失败');
  process.exit(1);
}

console.log(`\n✅ 输出 dist/index.html 与 dist/prices.json`);
