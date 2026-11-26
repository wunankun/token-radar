#!/usr/bin/env node
/**
 * 校验 data/ 并生成静态站与 prices.json。
 *
 *   node scripts/build.mjs            # 正常构建
 *   node scripts/build.mjs --strict   # 有任何 warning 也失败（CI 用）
 */
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { loadAll, writeJson, DIST, DATA, ensureDir, loadHealth, readJson } from './lib/io.mjs';
import { loadObservedStations, loadVerdicts } from './lib/observed-stations.mjs';
const round4 = (n) => (Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : n);
import { pickGroup, GROUP_SOURCE_LABEL } from './lib/pick-group.mjs';
import { KINDS, FLAGS, buildOfficialIndex, normalizeEntry, rechargeBonus, KIND_LABEL } from './lib/normalize.mjs';
import { renderSite } from './lib/render.mjs';

const args = new Set(process.argv.slice(2));
const STRICT = args.has('--strict');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const { config, models, official, providers, observed } = loadAll();

/* ---------- models ---------- */
// popularity：0-100 的手工先验热度。只在「还没有真实站点数据」时用来排序，
// 有真实数据后热度的主口径是 coverage（有几家中转站在卖这个模型）。
for (const [id, m] of Object.entries(models)) {
  if (m.popularity === undefined) {
    warn(`data/models.json: ${id} 没有 popularity，无真实数据时会排在下拉最后`);
  } else if (typeof m.popularity !== 'number' || m.popularity < 0 || m.popularity > 100) {
    err(`data/models.json: ${id}.popularity 必须是 0-100 的数字`);
  }
}

/* ---------- config ---------- */
const fx = Number(config?.fx?.usd_cny);
if (!Number.isFinite(fx) || fx <= 0) err('config.json: fx.usd_cny 必须是正数');

/* ---------- official ---------- */
const { index: officialIndex, errors: offErr } = buildOfficialIndex(official);
offErr.forEach(err);

for (const modelId of Object.keys(models)) {
  if (!officialIndex.has(modelId)) warn(`models.json: ${modelId} 没有官方基准价，只能展示绝对价、无法算倍率`);
}

/* ---------- 抓来的站（data/sources.json + data/observed/） ---------- */
// 只把「输出/输入比与官方同形」的行放进来，按次计费/表达式计费的不上榜单
const knownIds = new Set(providers.map((p) => p.id));
const scanned = loadObservedStations({ models, knownIds });
const verdicts = loadVerdicts(scanned.map((s) => s.id));

/* ---------- providers ---------- */
const seen = new Set();
const stations = [];
const skipped = [];

for (const p of [...providers, ...scanned]) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id || '')) err(`站点 id 不合法（小写字母/数字/连字符）: ${p.id}`);
  if (seen.has(p.id)) err(`站点 id 重复: ${p.id}`);
  seen.add(p.id);

  if (!p.name) err(`${p.id}: 缺少 name`);
  const verdict = verdicts.get(p.id) || null;
  if (!KINDS.includes(p.kind)) err(`${p.id}: kind 必须是 ${KINDS.join(' / ')}`);
  for (const f of p.risk_flags || []) if (!FLAGS.includes(f)) err(`${p.id}: 未知 risk_flag "${f}"`);

  if (p.affiliate) {
    if (!/^https?:\/\//.test(p.affiliate.url || '')) err(`${p.id}: affiliate.url 必须是 http(s) 链接`);
    if (p.affiliate.disclosure !== true) err(`${p.id}: 有推广链接就必须显式写 "disclosure": true（硬性规则）`);
    if (!p.affiliate.code) warn(`${p.id}: affiliate.code 为空，建议填邀请码方便核对`);
  }
  if (!p.demo && !p.pricing_url && p.kind !== 'official' && !p.observed_only) warn(`${p.id}: 缺少 pricing_url，无法回溯价格来源`);

  // status：paused / dead 的站点留在库里但不上榜，方便停更时只改一个字段
  if (p.status && p.status !== 'active') {
    if (!['paused', 'dead'].includes(p.status)) err(`${p.id}: status 只能是 active / paused / dead`);
    else skipped.push(`${p.id}（${p.status}）`);
    if (p.status === 'paused' || p.status === 'dead') continue;
  }

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
  // /api/status 里的汇率：只用来在页面上提醒「这个站的 1 美元额度不是 1 元买的」
  const st = (obs && obs.status) || p.status || null;
  if (st) {
    // usd_exchange_rate 是站自己声明的「1 美元额度值多少人民币」；没有它时，有些站把同一个数
    // 写在 price 里（1.5–12 之间才可信，0.1 这种是别的含义，别当汇率用）。
    const r1 = Number(st.usd_exchange_rate);
    const r2 = Number(st.price);
    const rate = r1 > 1.05 ? r1 : r2 > 1.5 && r2 < 12 ? r2 : null;
    if (rate) {
      p.usd_rate = rate;
      p.top_up = st.top_up_link || null;
    }
  }
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
    const tierInfo = (o) => {
      const g = o?.group_ratios || {};
      const names = Object.keys(g).filter((n) => typeof g[n] === 'number' && g[n] > 0);
      if (names.length < 2) return null;
      let minName = names[0];
      for (const n of names) if (g[n] < g[minName]) minName = n;
      const vals = names.map((n) => g[n]);
      return {
        count: names.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
        min_name: minName.replace(/[^0-9A-Za-z\u4e00-\u9fa5 _-]/g, '').trim() || null,
      };
    };
    const groupInfo = (o) => {
      const g = o?.group_ratios || {};
      const names = Object.keys(g);
      if (!names.length) return null;
      const used =
        names.find((n) => /default|默认/i.test(n) && g[n] === 1) ||
        names.find((n) => g[n] === 1) ||
        'default';
      const vals = names.map((n) => g[n]).filter((v) => typeof v === 'number' && v > 0);
      const clean = used.replace(/[^0-9A-Za-z\u4e00-\u9fa5 _-]/g, '').trim() || 'default';
      return {
        name: clean,
        ratio: g[used] ?? 1,
        count: names.length,
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    };
    // 逐行判定不过的模型不上榜单（输出/输入比与官方不同形 = 不是按 token 定价）
    if (!manual && verdict && !verdict.ok.has(modelId)) continue;
    // 站点级 multiplier 是默认值：模型条目里只写 {"value": 0.5} 或 {} 就够了，
    // 改价的日常操作因此从「改 N 个模型的同一个数」变成「改站点里的一个数」。
    const inherit = (spec) => {
      if (!spec || typeof spec !== 'object') return spec;
      const isAbsolute = spec.mode === 'absolute' || spec.input != null;
      if (isAbsolute) return spec;
      return p.multiplier ? { mode: 'multiplier', ...p.multiplier, ...spec } : spec;
    };
    let stationModel = null;
    if (manual) {
      stationModel = inherit(manual);
    } else if (auto) {
      // 同一个模型在不同分组里能差 20 倍：按 pickGroup 选出的「用户实际会用的档」重算
      const offUsd = officialIndex.get(modelId)?.usd?.input;
      let picked = pickGroup(obs, auto.raw);
      let base = Number(auto.raw?.model_ratio) * 2 * picked.ratio;
      // 算出来比官方还便宜 98% 以上，基本是包月/活动池，按量口径算不出这个钱 → 退回默认档
      if (offUsd && base / offUsd < 0.02) {
        picked = { name: 'default', full: 'default', ratio: Number(obs?.group_ratio) || 1, source: 'default', desc: '' };
        base = Number(auto.raw?.model_ratio) * 2 * picked.ratio;
      }
      const outRatio = Number(auto.raw?.completion_ratio) || 1;
      const cacheRatio = Number(auto.raw?.cache_ratio);
      stationModel = {
        mode: 'absolute',
        input: round4(base),
        output: round4(base * outRatio),
        cache_read: Number.isFinite(cacheRatio) && cacheRatio > 0 ? round4(base * cacheRatio) : null,
        group: {
          name: picked.name,
          full: picked.full,
          ratio: picked.ratio,
          source: picked.source,
          source_label: GROUP_SOURCE_LABEL[picked.source] || picked.source,
          desc: picked.desc,
          count: (groupInfo(obs) || {}).count ?? null,
        },
        tiers: tierInfo(obs),
        observed: true,
      };
    }
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
      // 抓来的站按「1 元 = 1 美元额度」面值：它标的那个数既是人民币实付，也是美元牌价
      faceValue: !manual && (p.observed_only || obs?.assumption === 'face_value_1cny_per_usd'),
    });
    if (res.error) {
      if (manual) err(res.error);
      else warn(`${res.error}（自动抓取数据，已跳过）`);
      continue;
    }
    if (!manual) {
      const mult = verdict?.mult?.get(modelId);
      res.row.note =
        `抓自 ${p.observed_at || '站点公开'} 的 /api/pricing，未经人工核验；` +
        (mult != null ? `站上倍率 ×${mult}（相对官方美元价），按「1 元 = 1 美元额度」面值折成人民币` : '按「1 元 = 1 美元额度」面值折算');
      res.row.observed_at = p.observed_at || null;
    }
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

/* ---------- 模型热度：从数据算 ---------- */
// coverage = 有几个「真实的中转站」在卖这个模型（官方行是基准、演示行是假数据，都不算）
const heatStations = new Set(
  stations.filter((s) => !s.station.demo && s.station.kind !== 'official').map((s) => s.station.id),
);
const coverage = {};
for (const s of stations) {
  if (s.station.demo || s.station.kind === 'official') continue;
  coverage[s.model.id] = (coverage[s.model.id] || 0) + 1; // 同一站同一模型只有一行，行数即站数
}
const maxCoverage = Math.max(0, ...Object.values(coverage));
const heatFromData = heatStations.size > 0 && maxCoverage > 0;
const modelList = Object.entries(models)
  .map(([id, m]) => {
    const cov = coverage[id] || 0;
    const prior = m.popularity ?? 0;
    return {
      id,
      label: m.label,
      vendor: m.vendor,
      popularity: prior,
      coverage: cov,
      heat: heatFromData ? Math.round((cov / maxCoverage) * 100) : prior,
      heat_source: heatFromData ? 'coverage' : 'manual',
    };
  })
  .sort((a, b) => b.heat - a.heat || b.popularity - a.popularity || a.label.localeCompare(b.label));

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
    auto_rows: stations.filter((s) => s.price_source === 'auto').length,
    auto_stations: new Set(stations.filter((s) => s.price_source === 'auto').map((s) => s.station.id)).size,
  },
  best: best
    ? { station: best.station.name, model: best.model.label, ratio: best.ratio.blend, discount: best.discount, effective: best.effective }
    : null,
  best_demo: bestDemo
    ? { station: bestDemo.station.name, model: bestDemo.model.label, ratio: bestDemo.ratio.blend, discount: bestDemo.discount, effective: bestDemo.effective }
    : null,
  models: modelList,
  heat: { source: heatFromData ? 'coverage' : 'manual', stations: heatStations.size, max_coverage: maxCoverage },
  catalog: (() => {
    const auto = readJson(join(DATA, 'models-auto.json'), null);
    if (!auto || !auto.count || !auto.stations) return null;
    return { count: auto.count, stations: auto.stations, threshold: auto.threshold, baseline: auto.baseline };
  })(),
  disabled_sources: (readJson(join(DATA, 'sources.json'), { sources: [] }).sources || [])
    .filter((s) => s && s.enabled === false)
    .map((s) => ({
      id: s.id,
      name: s.name || s.id,
      status: s.status || 'off',
      note: s.note || '',
      disabled_at: s.disabled_at || '',
    })),
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
console.log(
  `  模型热度：${
    heatFromData
      ? `按 ${heatStations.size} 个真实站的收录数算（最多的模型 ${maxCoverage} 家在卖）`
      : '暂无真实站，回落人工 popularity'
  }`,
);
if (meta.catalog) console.log(`  全站模型目录：${meta.catalog.count} 个模型（被 ≥${meta.catalog.threshold} 家站收录，共 ${meta.catalog.stations} 家站）`);
if (skipped.length) console.log(`  已停更（不上榜）：${skipped.join('、')}`);
console.log(`  官方基准 ${meta.counts.official_rows} 行，演示 ${meta.counts.demo_rows} 行，带推广链接 ${meta.counts.with_affiliate} 行`);
if (best) console.log(`  当前最优惠：${best.station.name} · ${best.model.label} · 便宜 ${(best.discount * 100).toFixed(1)}%`);

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
