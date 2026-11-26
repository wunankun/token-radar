#!/usr/bin/env node
/**
 * 维护审计：把「该人工看一眼的东西」列成一张清单。
 *
 *   node scripts/audit.mjs           # 终端里看
 *   node scripts/audit.mjs --md      # 输出 Markdown，可直接贴进 Issue
 *   node scripts/audit.mjs --strict  # 有「必须处理」时退出码 1（可挂进 CI）
 *
 * 它只读 data/，不改任何东西——判断要不要改、怎么改，仍然由人决定。
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadAll, loadHealth, readJson, DATA, ROOT } from './lib/io.mjs';

const args = new Set(process.argv.slice(2));
const MARKDOWN = args.has('--md');
const STRICT = args.has('--strict');

const DAY = 86400000;
const now = Date.now();
const daysSince = (iso) => (iso ? Math.floor((now - Date.parse(iso)) / DAY) : null);
const today = new Date().toISOString().slice(0, 10);

const items = { must: [], should: [], info: [] };
const add = (level, text) => items[level].push(text);

const { official, providers, observed } = loadAll();

/* ---------- 1. 官方基准价 ---------- */
const offAge = daysSince(official.as_of);
if (offAge == null) {
  add('must', '官方价 `as_of` 缺失：所有「优惠力度」都失去基准，补上复核日期');
} else if (offAge > 90) {
  add('must', `官方价已经 ${offAge} 天没复核（${official.as_of}）：厂商一降价，全站折扣就全错`);
} else if (offAge > 45) {
  add('should', `官方价已经 ${offAge} 天没复核（${official.as_of}），抽空对一遍厂商计费页`);
}

/* ---------- 2. 演示数据 ---------- */
const demos = providers.filter((p) => p.demo === true);
if (demos.length) {
  add('must', `还有 ${demos.length} 个演示站（${demos.map((p) => p.id).join('、')}），上线前应替换成真实站点`);
}

/* ---------- 3. 逐站检查 ---------- */
const hosts = new Map();
for (const p of providers) {
  const tag = `${p.name || p.id}（${p.id}）`;

  if (p.status === 'paused') add('info', `${tag} 已标记 paused，确认是真停更还是忘了改回来`);
  if (p.status === 'dead') add('info', `${tag} 已标记 dead，半年后可考虑归档`);
  if (p.kind === 'official') continue;

  // 价格新鲜度
  if (!p.demo) {
    const age = daysSince(p.price_updated_at);
    if (age == null) add('should', `${tag} 没写 price_updated_at，审计不出价格是否过期`);
    else if (age > 45) add('should', `${tag} 的价格 ${age} 天没核对（${p.price_updated_at}）`);
  }

  // 推广链接：没有就是白送流量
  if (!p.demo && !p.affiliate?.url) add('should', `${tag} 没有推广链接，这条流量拿不到返佣`);
  else if (p.affiliate && !p.affiliate.code) add('info', `${tag} 推广链接没填邀请码 code，不好核对归属`);

  // 抓取状态
  const hasEndpoint = p.observed_endpoint || String(p.pricing_url || '').includes('/api/pricing');
  if (hasEndpoint && !p.demo) {
    const file = join(DATA, 'observed', `${p.id}.json`);
    if (!existsSync(file)) {
      add('info', `${tag} 配了 /api/pricing 但还没抓过，跑一次 node scripts/fetch-pricing.mjs --write`);
    } else {
      const snap = readJson(file, {});
      if (snap.http_status !== 200) {
        add('must', `${tag} 最近一次抓取失败（HTTP ${snap.http_status}）：站点可能关站或换了接口`);
      } else if (daysSince(snap.fetched_at) > 3) {
        add('info', `${tag} 抓取快照 ${snap.fetched_at?.slice(0, 10)} 的，早于 3 天前`);
      }
      const auto = Object.keys(observed.get(p.id)?.models || {}).length;
      if (auto === 0) add('info', `${tag} 抓取成功了但没匹配到任何模型，检查别名表`);
    }
  }

  // 可用率
  const h = loadHealth(p.id);
  if (!p.demo && !h) add('info', `${tag} 没有探活记录（没配 key 或没跑过 probe）`);
  if (h) {
    if (h.uptime_7d != null && h.uptime_7d < 0.9) {
      add('should', `${tag} 最近 7 天可用率只有 ${(h.uptime_7d * 100).toFixed(0)}%，考虑降级或标注`);
    }
    const idle = daysSince(h.last_ok);
    if (idle != null && idle > 3) add('should', `${tag} 已经 ${idle} 天没有一次成功请求`);
  }

  // 重复域名
  if (p.homepage) {
    try {
      const host = new URL(p.homepage).host.replace(/^www\./, '');
      if (hosts.has(host)) add('should', `${tag} 与 ${hosts.get(host)} 域名相同，可能重复收录`);
      else hosts.set(host, tag);
    } catch {
      add('must', `${tag} homepage 不是合法 URL：${p.homepage}`);
    }
  }
}

/* ---------- 4. 输出 ---------- */
const counts = { must: items.must.length, should: items.should.length, info: items.info.length };
const ICON = { must: '🔴', should: '🟡', info: '⚪' };
const TITLE = { must: '必须处理', should: '建议处理', info: '看看就好' };

if (MARKDOWN) {
  console.log(`## 维护审计 ${today}\n`);
  console.log(`🔴 ${counts.must} · 🟡 ${counts.should} · ⚪ ${counts.info}\n`);
  for (const level of ['must', 'should', 'info']) {
    if (!items[level].length) continue;
    console.log(`### ${ICON[level]} ${TITLE[level]}\n`);
    for (const t of items[level]) console.log(`- [ ] ${t}`);
    console.log('');
  }
} else {
  console.log(`\n维护审计 · ${today}`);
  console.log(`  🔴 必须处理 ${counts.must} · 🟡 建议处理 ${counts.should} · ⚪ 看看就好 ${counts.info}\n`);
  for (const level of ['must', 'should', 'info']) {
    if (!items[level].length) continue;
    console.log(`  ${ICON[level]} ${TITLE[level]}`);
    for (const t of items[level]) console.log(`     · ${t}`);
    console.log('');
  }
  if (!counts.must && !counts.should) console.log('  没发现需要动手的事。\n');
}

if (STRICT && counts.must) process.exitCode = 1;
