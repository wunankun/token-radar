#!/usr/bin/env node
/**
 * 每周维护：一条命令跑完「抓汇率 → 抓中转站价 → 抓 OpenRouter → 逐行判定 → 构建 → 审计 → 出周报」。
 *
 *   node scripts/weekly.mjs              # 全量（会联网，约 1–3 分钟）
 *   node scripts/weekly.mjs --skip-fetch # 跳过所有联网抓取，只跑本地判定/构建/审计/周报
 *   node scripts/weekly.mjs --md         # 额外写一份 data/observed/WEEKLY.md
 *   node scripts/weekly.mjs --strict     # 构建时把 warning 当失败（CI 用）
 *
 * 设计原则：抓取失败不阻塞其余步骤（网络抖动是常态，站点关停也该继续出榜），
 * 但「判定/构建」失败会立即中止，因为那说明数据本身坏了。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DATA, readJson } from './lib/io.mjs';

const argv = process.argv.slice(2);
const SKIP_FETCH = argv.includes('--skip-fetch');
const WRITE_MD = argv.includes('--md');
const STRICT = argv.includes('--strict');

const t0 = Date.now();
const ran = [];
const failed = [];

function run(label, file, args = [], { fatal = false } = {}) {
  process.stdout.write(`\n\x1b[36m▸ ${label}\x1b[0m\n`);
  const r = spawnSync(process.execPath, [file, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (r.status === 0) {
    ran.push(label);
    return true;
  }
  failed.push({ label, code: r.status });
  if (fatal) {
    console.error(`\n✗ 「${label}」失败（exit ${r.status}），后续步骤中止。`);
    process.exit(r.status || 1);
  }
  console.error(`\n⚠ 「${label}」失败（exit ${r.status}），继续跑剩下的步骤。`);
  return false;
}

/* ---------- 1. 抓取 ---------- */
if (!SKIP_FETCH) {
  run('抓汇率', 'scripts/fetch-fx.mjs');
  run('抓中转站定价', 'scripts/fetch-pricing.mjs', ['--write', '--concurrency', '8']);
  run('抓 OpenRouter 对照', 'scripts/fetch-openrouter.mjs', ['--write']);
} else {
  console.log('（--skip-fetch：跳过联网抓取）');
}

/* ---------- 2. 判定（必须成功） ---------- */
run('逐行判定可以怎么算', 'scripts/explain-observed.mjs', ['--write'], { fatal: true });

/* ---------- 3. 构建（必须成功） ---------- */
run('汇总全站模型目录', 'scripts/build-catalog.mjs', [], { fatal: true });
run('构建站点', 'scripts/build.mjs', STRICT ? ['--strict'] : [], { fatal: true });

/* ---------- 4. 审计（只提醒） ---------- */
run('维护审计', 'scripts/audit.mjs');

/* ---------- 5. 周报 ---------- */
function loadHistory() {
  const dir = join(DATA, 'price-history');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const lines = readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean);
      const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
      const tail = lines.slice(-2).map(parse).filter(Boolean);
      return {
        id: f.replace(/\.jsonl$/, ''),
        prev: tail[0] || null,
        last: tail[1] || null,
        rounds: lines.length,
      };
    });
}

const pct = (from, to) => (from > 0 ? ((to - from) / from) * 100 : null);

function weekly() {
  const files = loadHistory();
  const changed = [];
  const single = [];
  let noSnapshot = 0;
  let versionSkips = 0;

  for (const f of files) {
    const snap = readJson(join(DATA, 'observed', `${f.id}.json`), null);
    if (!snap || snap.http_status !== 200) {
      noSnapshot += 1;
      continue;
    }
    if (!f.prev || !f.last) continue;
    if (f.rounds < 2) { single.push(f.id); continue; }
    // 计价管线版本变了（选档/折算算法调整过），两轮数字不可比，跳过并把原因写进周报。
    if ((f.prev.v || 1) !== (f.last.v || 1)) { versionSkips += 1; continue; }

    // 只比对「这一轮判定为可以逐行算价」的模型，避免把按次计费/换单位造成的假涨价算进来。
    const okIds = new Set(
      (snap.derivation?.models || []).filter((m) => m.verdict === 'ok').map((m) => m.id),
    );

    const models = f.last.models || {};
    for (const [mid, now] of Object.entries(models)) {
      if (okIds.size && !okIds.has(mid)) continue;
      const before = (f.prev.models || {})[mid];
      if (!before) continue;
      const pi = pct(before[0], now[0]);
      const po = pct(before[1], now[1]);
      const useInput = Math.abs(pi ?? 0) >= Math.abs(po ?? 0);
      const p = useInput ? pi : po;
      if (p == null || Math.abs(p) < 0.5) continue;
      changed.push({
        id: f.id,
        model: mid,
        field: useInput ? '输入' : '输出',
        from: useInput ? before[0] : before[1],
        to: useInput ? now[0] : now[1],
        pct: p,
      });
    }
  }

  changed.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const normal = changed.filter((c) => Math.abs(c.pct) <= 200);
  const weird = changed.filter((c) => Math.abs(c.pct) > 200);
  const up = normal.filter((c) => c.pct > 0).length;
  const down = normal.filter((c) => c.pct < 0).length;

  const prices = readJson(join(ROOT, 'dist', 'prices.json'), null);
  const c = prices?.meta?.counts || {};
  const best = prices?.meta?.best;

  const lines = [];
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  lines.push(`# 周报 · ${now} CST`);
  lines.push('');
  lines.push(`- 榜单：**${c.stations ?? '?'} 个站点 / ${c.rows ?? '?'} 行**（自动抓取 ${c.auto_rows ?? '?'} 行，覆盖 ${c.auto_stations ?? '?'} 站；官方基准 ${c.official_rows ?? '?'} 行）`);
  lines.push(`- 本轮抓取：${files.length} 站有历史记录，其中 **${noSnapshot} 站没拿到 200**（关站/换接口/网络）`);
  lines.push(`- 价格变动（较上一轮，只算判定可比、且计价算法相同的记录）：**涨 ${up} 个、跌 ${down} 个**，另有 ${weird.length} 个跳变超过 200%、首次记录 ${single.length} 站${versionSkips ? `、因算法升级跳过 ${versionSkips} 站` : ''}`);
  if (best) lines.push(`- 当前最优惠：**${best.station} · ${best.model} · 便宜 ${(best.discount * 100).toFixed(1)}%**`);
  if (normal.length) {
    lines.push('');
    lines.push('## 正常变动');
    lines.push('');
    lines.push('| 站点 | 模型 | 字段 | 变化 |');
    lines.push('| --- | --- | --- | --- |');
    for (const t of normal.slice(0, 8)) {
      const sign = t.pct > 0 ? '+' : '';
      lines.push(`| ${t.id} | ${t.model} | ${t.field} | $${t.from} → $${t.to}（${sign}${t.pct.toFixed(1)}%） |`);
    }
  }
  if (weird.length) {
    lines.push('');
    lines.push('## 跳变超过 200%（多半是换了分组、改成统一定价或模型重定向，别当降价看）');
    lines.push('');
    lines.push('| 站点 | 模型 | 字段 | 变化 |');
    lines.push('| --- | --- | --- | --- |');
    for (const t of weird.slice(0, 6)) {
      const sign = t.pct > 0 ? '+' : '';
      lines.push(`| ${t.id} | ${t.model} | ${t.field} | $${t.from} → $${t.to}（${sign}${t.pct.toFixed(0)}%） |`);
    }
    if (weird.length > 6) lines.push(`| … | 另有 ${weird.length - 6} 条 | | |`);
  }
  lines.push('');
  lines.push('## 下一步');
  lines.push('');
  lines.push('- 「没拿到 200」的站去点一下官网：还活着就重抓，跑不通就标 `enabled:false`。');
  lines.push('- `node scripts/audit.mjs` 的 🔴 项按提示处理（演示站替换、官方价过期、推广链接缺失）。');
  lines.push('- 跳变异常的站，打开它的 `/api/pricing` 看是不是分组或计费方式变了。');
  lines.push('- 挑 1–2 个自己注册过的站，从 `data/sources.json` 挪进 `data/providers/`，加上真实推广链接。');
  lines.push('');

  return { text: lines.join('\n'), up, down, weird: weird.length, noSnapshot, normal, versionSkips };
}

const report = weekly();
console.log(`\n${report.text}`);

if (WRITE_MD) {
  const out = join(DATA, 'observed', 'WEEKLY.md');
  writeFileSync(out, report.text, 'utf8');
  console.log(`✓ 已写入 ${out.replace(ROOT + '/', '')}`);
}

/* ---------- 收尾 ---------- */
const secs = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`\n完成 ${ran.length}/${ran.length + failed.length} 步 · ${secs}s`);
if (failed.length) {
  console.log(`失败：${failed.map((f) => f.label).join('、')}`);
  process.exit(1);
}
if (report.noSnapshot) console.log(`注意：${report.noSnapshot} 站本轮没拿到 200，见上方审计与周报。`);
