#!/usr/bin/env node
// 给抓来的观测价写「这个数是怎么来的」备注，并把同一站内互相打架的倍率分类。
//
// 用法：
//   node scripts/explain-observed.mjs            # 只打印
//   node scripts/explain-observed.mjs --write    # 写回 data/observed/<id>.json 的 derivation + 生成 REPORT.md
//   node scripts/explain-observed.mjs --only qinzhiai-com
//
// 分类（按站点内多个模型相对官方价的倍数形状判定）：
//   aligned    同口径：所有匹配模型都 ≈1.00，价格可直接与官方比
//   scaled     整体倍数：所有模型乘同一个系数（≥1.05 或 ≤0.95），倍数稳定
//   flat       统一价：所有模型输入价都等于同一个数（与该模型无关，多半是套餐/按次/表达式计费）
//   mixed      口径不一致：倍数在站内从 1.00 散到几十倍，不能用
import { join } from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DATA, readJson, writeJson } from './lib/io.mjs';
import { buildOfficialIndex } from './lib/normalize.mjs';

const LEGACY_NAMES = new Set([
  'deepseek-chat',
  'deepseek-reasoner',
  'claude-3-5-sonnet-20241022',
  'claude-sonnet-4-5',
  'claude-3-opus-20240229',
  'claude-3-7-sonnet-20250219',
]);

const CLASS_LABEL = {
  aligned: '同口径',
  scaled: '整体倍数',
  flat: '统一价',
  mixed: '口径不一致',
  none: '没匹配上',
};

export function classify(snapshot, officialIndex) {
  const rows = [];
  for (const [id, m] of Object.entries(snapshot.models || {})) {
    const off = officialIndex.get(id);
    if (!off) continue;
    const ref = off.usd;
    if (!(ref.input > 0) || !(ref.output > 0)) continue;
    if (!(m.input > 0)) continue;
    const rawName = m.raw?.model_name ?? id;
    rows.push({
      id,
      name: rawName,
      legacy: LEGACY_NAMES.has(rawName),
      usd: { input: m.input, output: m.output },
      official: { input: ref.input, output: ref.output },
      in_mult: m.input / ref.input,
      out_mult: m.output / ref.output,
      completion_ratio: m.raw?.completion_ratio ?? null,
      official_comp: (ref.output / ref.input),
    });
  }
  for (const r of rows) {
    const ok = r.completion_ratio == null ? null : Math.abs(r.completion_ratio / r.official_comp - 1) <= 0.2;
    r.shape_ok = ok;
    r.verdict = r.legacy ? 'legacy' : ok === false ? 'shape' : 'ok';
    r.why = r.legacy
      ? '旧代数型号名，价格表已过期'
      : ok === false
        ? `输出/输入比 ${r.completion_ratio}，官方是 ${fmt(r.official_comp)}，不是同一计价形状`
        : '输出/输入比与官方一致，这一行能单独算';
  }

  if (!rows.length) {
    return { class: 'none', rows, matched: 0, note: '这次快照里没有能对上官方价的模型。', confidence: 'none' };
  }

  const use = rows.filter((r) => !r.legacy);
  const pool = use.length ? use : rows;
  const inputs = pool.map((r) => r.usd.input).sort((a, b) => a - b);
  const flatSpread = inputs[0] > 0 ? inputs[inputs.length - 1] / inputs[0] : Infinity;

  // 站内主流倍数：找一个能覆盖最多模型的候选倍数（±4% 内算一致）
  const mults = pool.map((r) => r.in_mult).sort((a, b) => a - b);
  let dominant = mults[Math.floor(mults.length / 2)];
  let support = 0;
  for (const cand of mults) {
    const n = mults.filter((m) => Math.abs(m / cand - 1) <= 0.04).length;
    if (n > support || (n === support && Math.abs(cand - 1) < Math.abs(dominant - 1))) {
      support = n;
      dominant = cand;
    }
  }
  const share = pool.length ? support / pool.length : 0;
  const odd = pool.filter((r) => Math.abs(r.in_mult / dominant - 1) > 0.04);
  const ok = pool.filter((r) => Math.abs(r.in_mult / dominant - 1) <= 0.04);
  const uniformPrice = pool.length >= 2 && flatSpread <= 1.02 && Math.abs(dominant - 1) > 0.05;

  let cls;
  let confidence;
  if (uniformPrice) {
    cls = 'flat';
    confidence = 'medium';
  } else if (share >= 0.5 && Math.abs(dominant - 1) <= 0.05) {
    cls = 'aligned';
    confidence = odd.length ? 'medium' : 'high';
  } else if (share >= 0.5) {
    cls = 'scaled';
    confidence = odd.length ? 'medium' : 'high';
  } else {
    cls = 'mixed';
    confidence = 'low';
  }

  const flatPrice = cls === 'flat' ? { input: inputs[0], output: pool[0].usd.output } : null;
  return {
    class: cls,
    rows,
    matched: rows.length,
    core: pool.length,
    dominant,
    share,
    flatSpread,
    flatPrice,
    ok: ok.map((r) => r.id),
    odd: odd.map((r) => ({ id: r.id, name: r.name, mult: r.in_mult })),
    confidence,
  };
}

function fmt(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return String(Number(n.toFixed(digits)));
}

function note(c, snapshot) {
  const gr = snapshot.group_ratio ?? 1;
  const groups = snapshot.groups ?? 0;
  const grText = `group_ratio=${gr}${snapshot.group_source === 'manual' ? '（手填）' : ''}`;
  const legText = c.rows.filter((r) => r.legacy).map((r) => r.name);
  const legacyText = legText.length ? ` 另：旧代数命名 ${legText.join('、')} 已单列，不参与判定。` : '';
  const support = Math.round((c.share || 0) * c.core);
  const oddText = c.odd?.length
    ? ` 对不上的 ${c.odd.length} 个：${c.odd.map((o) => `${o.id}×${fmt(o.mult)}`).join('、')}，多半是沿用旧价表或把别的型号并到同名条目，不参与比价。`
    : '';
  const tail = ` 本行按 ${grText} 折算${groups ? `；该站另有 ${groups} 个分组倍率，真正的折扣在那里` : ''}。`;
  switch (c.class) {
    case 'aligned':
      return `对得上官方价的 ${c.matched} 个模型里，${support} 个倍率都是官方 × ${fmt(c.dominant)}（偏差 <4%），说明这站和官方用的是同一套单位，价格可以直接比。${tail}${oddText}${legacyText}`;
    case 'scaled':
      return `对得上官方价的 ${c.matched} 个模型里，${support} 个都是官方 × ${fmt(c.dominant)}，属于整站统一加价或统一折扣，不是单位问题，价格按 × ${fmt(c.dominant)} 计可以直接比。${tail}${oddText}${legacyText}`;
    case 'flat':
      return `这站不按模型定价：${c.core} 个模型在 ${grText} 时输入价都正好是 $${fmt(c.flatPrice.input)}/M。倍数看着从 ${fmt(c.dominant)} 到几十倍很大，其实是官方各型号价不同、它只收一个价。最终只能记「统一单价 $${fmt(c.flatPrice.input)}/M 输入」，不能逐模型对比。实际扣费还要乘它自己的分组倍率${groups ? `（该站 ${groups} 个组，从 ${fmt(Math.min(...Object.values(snapshot.group_ratios || {})))} 到 ${fmt(Math.max(...Object.values(snapshot.group_ratios || {})))}）` : ''}，所以真价 = ${fmt(c.flatPrice.input)} × 分组倍率。${legacyText}`;
    case 'mixed':
      return `站内倍率吵成一团：${c.matched} 个对得上的模型里没有多数派（最集中的只占 ${Math.round((c.share || 0) * 100)}%），从 ${fmt(c.dominant)} 倍散到 ${fmt(Math.max(...(c.odd || []).map((o) => o.mult), c.dominant))} 倍。任何统一换算系数（×7.1、×2、×5）都没法让这些倍数同时成立，所以不是单位问题 —— 它多半按次/按表达式计费，或把不同型号并到同名条目。这份价不能当单价用。${legacyText}`;
    default:
      return '没有可匹配的模型。';
  }
}

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

  const { index: officialIndex, errors: officialErrors } = buildOfficialIndex(readJson(join(DATA, 'official.json')));
  if (officialErrors.length) for (const e of officialErrors) console.error(e);
  const files = readdirSync(join(DATA, 'observed'))
    .filter((f) => f.endsWith('.json') && f !== 'index.json' && f !== 'openrouter.json')
    .filter((f) => (only ? f === `${only}.json` : true));

  const out = [];
  for (const f of files) {
    const snap = JSON.parse(readFileSync(join(DATA, 'observed', f), 'utf8'));
    const c = classify(snap, officialIndex);
    const derivation = {
      class: c.class,
      class_label: CLASS_LABEL[c.class],
      unit: 'USD/1M tokens',
      basis: `new-api model_ratio × 2 × group_ratio（1 USD = 500,000 quota），${snap.group_source === 'manual' ? '分组倍率手填' : '分组倍率取默认/自动'}`,
      group_ratio: snap.group_ratio ?? 1,
      group_source: snap.group_source ?? null,
      matched: c.matched ?? 0,
      comparable: c.core ?? 0,
      dominant_multiple: c.dominant ?? null,
      agreement: c.share == null ? null : Number(c.share.toFixed(3)),
      comparable_models: c.ok ?? [],
      models: (c.rows || []).map((r) => ({
        id: r.id,
        name: r.name,
        input: Number(r.usd.input.toFixed(4)),
        output: Number(r.usd.output.toFixed(4)),
        multiple: Number(r.in_mult.toFixed(3)),
        shape_ok: r.shape_ok,
        verdict: r.verdict,
        why: r.why,
      })),
      rows_ok: (c.rows || []).filter((r) => r.verdict === 'ok').length,
      rows_total: (c.rows || []).length,
      excluded_models: (c.odd ?? []).map((o) => ({ id: o.id, name: o.name, multiple: Number(o.mult.toFixed(3)) })),
      flat_price: c.flatPrice ? { input: c.flatPrice.input, output: c.flatPrice.output } : null,
      confidence: c.confidence,
      note: note(c, snap),
      computed_at: new Date().toISOString(),
    };
    out.push({ id: snap.station_id, snap, c, derivation });
    if (write) writeJson(join(DATA, 'observed', f), { ...snap, derivation });
  }

  const order = ['aligned', 'scaled', 'flat', 'mixed', 'none'];
  out.sort((a, b) => order.indexOf(a.c.class) - order.indexOf(b.c.class) || (a.c.median ?? 9) - (b.c.median ?? 9));

  const counts = {};
  for (const o of out) counts[o.c.class] = (counts[o.c.class] || 0) + 1;

  console.log(`\n观测价归类 · ${out.length} 份快照`);
  for (const k of order) if (counts[k]) console.log(`  ${CLASS_LABEL[k].padEnd(6)} ${String(counts[k]).padStart(3)}  ${k}`);
  console.log('');
  console.log('站点'.padEnd(26), '类别'.padEnd(6), '主流倍数'.padStart(8), '一致度'.padStart(6), '匹配'.padStart(4), ' 结论');
  for (const o of out) {
    const c = o.c;
    const verdict =
      c.class === 'aligned'
        ? '可用'
        : c.class === 'scaled'
          ? `可用（×${fmt(c.dominant)}）`
          : c.class === 'flat'
            ? `统一价 $${fmt(c.flatPrice?.input)}`
            : c.class === 'mixed'
              ? '不可用'
              : '—';
    console.log(
      o.id.padEnd(26),
      CLASS_LABEL[c.class].padEnd(6),
      fmt(c.dominant).padStart(7),
      `${Math.round((c.share || 0) * 100)}%`.padStart(6),
      String(c.matched ?? 0).padStart(4),
      ' ',
      verdict,
      c.odd?.length ? `（${c.odd.length} 个型号不参与）` : '',
    );
  }

  if (write) {
    const md = buildMarkdown(out, counts);
    const p = join(DATA, 'observed', 'REPORT.md');
    writeFileSync(p, md, 'utf8');
    console.log(`\n已写回 ${out.length} 份快照的 derivation，并生成 ${p}`);
  } else {
    console.log('\n（只打印。要写回并生成 REPORT.md，加 --write）');
  }
}

function buildMarkdown(out, counts) {
  const now = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# 观测价怎么算出来的（${now}）`, '');
  lines.push('这份表回答一个问题：**从各站 /api/pricing 抓来的数字，凭什么能当成价格用？**', '');
  lines.push('## 一句话公式', '');
  lines.push('```');
  lines.push('USD/百万输入 = model_ratio × 2 × group_ratio');
  lines.push('USD/百万输出 = 上面的数 × completion_ratio');
  lines.push('```', '');
  lines.push('`model_ratio` 是 new-api / one-api 的模型倍率，约定 1 美元 = 500,000 quota，所以倍率 1 = $2 / 百万 token；`group_ratio` 是分组倍率，同一个站对不同分组给不同折扣。', '');
  lines.push('抓来的数就是这个公式算的，没有别的换算。问题是每个站的倍率表并不是同一把尺子，于是要把 66 份快照分成四类：', '');
  lines.push('| 类别 | 含义 | 能怎么用 | 数量 |');
  lines.push('| --- | --- | --- | --- |');
  lines.push('| 同口径 | 所有匹配模型都 ≈ 官方 × 1.00 | 直接当价格用 | ' + (counts.aligned || 0) + ' |');
  lines.push('| 整体倍数 | 所有模型乘同一个系数 | 当价格用，但要说明是整站加价/折扣 | ' + (counts.scaled || 0) + ' |');
  lines.push('| 统一价 | 所有模型同价，与型号无关 | 只能记「统一单价」，不能逐模型比 | ' + (counts.flat || 0) + ' |');
  lines.push('| 口径不一致 | 站内倍率从 1 倍散到几十倍 | 不能用 | ' + (counts.mixed || 0) + ' |');
  lines.push('', '## 逐站结论', '');
  lines.push('| 站点 | 类别 | 主流倍数 | 一致度 | 匹配模型 | 备注 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const o of out) {
    const c = o.c;
    const noteText = o.derivation.note.replace(/\|/g, '\\|');
    lines.push(
      `| ${o.id} | ${CLASS_LABEL[c.class]} | ${fmt(c.dominant)} | ${Math.round((c.share || 0) * 100)}% | ${c.matched ?? 0} | ${noteText} |`,
    );
  }
  lines.push('', '## 已知的坑', '');
  lines.push('1. **旧代数命名**：`deepseek-chat` / `deepseek-reasoner` / `claude-3-5-sonnet-20241022` 这些老名字，各站的倍率是按老价格表写的，跟现在的官方价不是一回事，所以不参与分类判定。');
  lines.push('2. **表达式计费**：少数站的 `billing_mode` 是 `tiered_expr`，`model_ratio` 根本不是单价，是表达式里的系数，这类只能归为「口径不一致」。');
  lines.push('3. **分组折扣**：`group_ratio` 小于 1 才是真折扣，但多数分组限定用途（`claude_free`、`gpt生图`、`codex-pro`），取全站最小值会得到假便宜。');
  lines.push('4. **`$/M` 前提**：以上都假设站方的倍率表以美元计价（new-api 的默认语义）。如果某站其实按人民币标价，真实价格要再除以 7.1。');
  lines.push('');
  lines.push('重新生成：`node scripts/explain-observed.mjs --write`');
  lines.push('');
  return lines.join('\n');
}

main();
