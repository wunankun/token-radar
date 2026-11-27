#!/usr/bin/env node
// 站点规则库检查：哪些站已经有 data/rules/<id>.md，哪些还没有。
// 用法：node scripts/rules.mjs [--md]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, listJson, readJson } from './lib/io.mjs';

const RULES = join(DATA, 'rules');
const md = process.argv.includes('--md');

function ruleFile(id) {
  return join(RULES, `${id}.md`);
}

function info(file) {
  const st = statSync(file);
  const body = readFileSync(file, 'utf8');
  const tbd = /##\s*待核验([\s\S]*)$/.exec(body);
  const pending = tbd && tbd[1].replace(/[-*>\s]/g, '').length > 0;
  return { size: st.size, mtime: st.mtime.toISOString().slice(0, 10), pending };
}

const stations = new Map();
for (const s of (readJson(join(DATA, 'sources.json')) || {}).sources || []) {
  stations.set(s.id, { id: s.id, name: s.name || s.homepage, approved: s.approved === true, enabled: s.enabled !== false, kind: 'relay' });
}
for (const file of listJson(join(DATA, 'providers'))) {
  const p = readJson(file);
  if (!p || !p.id) continue;
  stations.set(p.id, {
    id: p.id,
    name: p.name,
    approved: true,
    enabled: (p.status || 'active') === 'active',
    kind: p.kind || 'relay',
    demo: p.demo === true,
  });
}

const rows = [...stations.values()].map((s) => {
  const f = ruleFile(s.id);
  const has = existsSync(f);
  return { ...s, has, ...(has ? info(f) : { size: 0, mtime: null, pending: false }) };
});

const withRules = rows.filter((r) => r.has);
// 官方直购的「规则」就是官方计费页，已经写在 official.json 里；演示站不用建
const missing = rows.filter((r) => !r.has && r.approved && r.enabled && r.kind !== 'official' && !r.demo);

if (md) {
  console.log(`## 站点规则库\n`);
  console.log(`已建档 ${withRules.length} 家 / 中转站应建档 ${withRules.length + missing.length} 家\n`);
  if (withRules.length) {
    console.log(`| 站点 | 文件 | 更新 | 待核验 |`);
    console.log(`|---|---|---|---|`);
    for (const r of withRules) {
      console.log(`| ${r.name} | \`data/rules/${r.id}.md\` | ${r.mtime} | ${r.pending ? '有' : '—'} |`);
    }
    console.log('');
  }
  if (missing.length) {
    console.log(`还没建档（已上架/已确认的站）：\n`);
    for (const r of missing) console.log(`- [ ] ${r.name}（\`${r.id}\`）`);
  }
} else {
  console.log(`\n站点规则库`);
  console.log(`  已建档 ${withRules.length} 家，缺 ${missing.length} 家`);
  for (const r of withRules) {
    console.log(`  ✓ ${r.id.padEnd(28)} ${r.mtime}${r.pending ? ' (有待核验)' : ''}`);
  }
  for (const r of missing) console.log(`  ✗ ${r.id.padEnd(28)} ${r.approved ? '已确认，建议建档' : '未确认'}`);
}
