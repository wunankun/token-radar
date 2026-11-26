#!/usr/bin/env node
/**
 * 人工确认一家自动扫到的站，把它放上榜单。
 *
 *   node scripts/approve.mjs api-top.com          # 确认上架
 *   node scripts/approve.mjs api-top.com --off    # 撤回
 *   node scripts/approve.mjs --list               # 看看哪些已上架、哪些待确认
 *
 * 只改 data/sources.json 里的 approved 字段，不动价格；确认完跑 `npm run build` 就能看到它。
 */
import { join } from 'node:path';
import { readJson, writeJson, DATA } from './lib/io.mjs';

const argv = process.argv.slice(2);
const file = join(DATA, 'sources.json');
const db = readJson(file, { sources: [] });
const list = db.sources || [];

if (argv.includes('--list') || argv.length === 0) {
  const on = list.filter((x) => x.approved === true);
  const off = list.filter((x) => x.approved !== true);
  console.log(`已上架 ${on.length} 家：`);
  for (const x of on) console.log(`  ✓ ${x.id.padEnd(28)} ${x.name || ''}`);
  console.log(`\n待确认 ${off.length} 家（前 20 个）：`);
  for (const x of off.slice(0, 20)) console.log(`  · ${x.id.padEnd(28)} ${x.name || ''}`);
  console.log('\n用法：node scripts/approve.mjs <域名或id>     上架');
  console.log('      node scripts/approve.mjs <域名或id> --off 撤回');
  process.exit(0);
}

const target = argv[0].toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
const off = argv.includes('--off');
const hit = list.find((x) =>
  [x.id, x.name, x.homepage, x.pricing_url].filter(Boolean).some((v) => String(v).toLowerCase().includes(target)),
);
if (!hit) {
  console.error(`没找到包含 "${target}" 的站点。用 --list 看现有 id。`);
  process.exit(1);
}

hit.approved = !off;
if (off) hit.note = `${new Date().toISOString().slice(0, 10)} 人工撤回，不上榜`;
else if (!hit.note) hit.note = `${new Date().toISOString().slice(0, 10)} 人工确认上架`;
writeJson(file, db);

const snap = readJson(join(DATA, 'observed', `${hit.id}.json`), null);
const ok = (snap?.derivation?.models || []).filter((m) => m.verdict === 'ok');
console.log(`${off ? '已撤回' : '已上架'}：${hit.id}（${hit.name || hit.homepage}）`);
if (ok.length) {
  console.log(`  当前能上榜的模型 ${ok.length} 个：`);
  for (const m of ok.slice(0, 12)) {
    const line = `    ${m.id.padEnd(20)} 输入 ${m.input} / 输出 ${m.output}（官方美元额度 × ${m.multiple}）`;
    console.log(line);
  }
  if (ok.length > 12) console.log(`    … 另有 ${ok.length - 12} 个`);
} else {
  console.log('  ⚠️ 这家站没有能逐模型判定的行（形状对不上/旧代号码），上榜后可能一行都不显示。');
}
console.log(off ? '' : '\n下一步：npm run build  （或 npm run weekly 连抓带构建）');
