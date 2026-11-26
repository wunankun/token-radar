#!/usr/bin/env node
/**
 * 新建一个站点的数据文件。
 *
 *   node scripts/add-station.mjs --id my-site --name "我的站" --kind official-relay \
 *     --homepage https://my-site.com \
 *     --aff "https://my-site.com/register?aff=CODE" \
 *     --pricing https://my-site.com/pricing \
 *     --endpoint https://my-site.com/api/pricing
 *
 *   ... --model claude-sonnet-5-5 --mult 0.62 --base cny_official   # 倍率模式
 *   ... --model claude-sonnet-5-5 --in 8.8 --out 44                 # 绝对价模式（元/百万）
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, writeJson, readJson } from './lib/io.mjs';
import { KINDS, KIND_LABEL } from './lib/normalize.mjs';

const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const flag = (n) => argv.includes(n);

const id = opt('--id');
const name = opt('--name');
const kind = opt('--kind', 'official-relay');
const homepage = opt('--homepage');
const pricing = opt('--pricing');
const endpoint = opt('--endpoint');
const aff = opt('--aff');
const code = opt('--code');
const commission = opt('--commission', '');
const modelId = opt('--model');
const mult = opt('--mult');
const base = opt('--base', 'cny_official');
const inPrice = opt('--in');
const outPrice = opt('--out');
const cachePrice = opt('--cache');

if (!id || !name) {
  console.error('至少需要 --id 和 --name。完整用法见文件头注释。');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error('--id 只能用小写字母、数字、连字符');
  process.exit(1);
}
if (!KINDS.includes(kind)) {
  console.error(`--kind 必须是：${KINDS.join(' / ')}`);
  process.exit(1);
}

const file = join(DATA, 'providers', `${id}.json`);
if (existsSync(file)) {
  console.error(`已存在：data/providers/${id}.json（要改就直接编辑它）`);
  process.exit(1);
}

const models = readJson(join(DATA, 'models.json'), {});
const provider = {
  id,
  name,
  kind,
  homepage: homepage || undefined,
  pricing_url: pricing || undefined,
  first_seen: new Date().toISOString().slice(0, 10),
  affiliate: aff
    ? { url: aff, code: code || 'YOUR_CODE', commission: commission || null, disclosure: true }
    : null,
  recharge: null,
  billing: { ratio: null, measured_at: null },
  risk_flags: ['unverified'],
  models: {},
};

if (endpoint) provider.observed_endpoint = endpoint;
if (flag('--demo')) provider.demo = true;

if (modelId) {
  if (!models[modelId]) {
    console.error(`模型 ${modelId} 未在 data/models.json 登记，可用：${Object.keys(models).join(', ')}`);
    process.exit(1);
  }
  if (mult) {
    provider.models[modelId] = { mode: 'multiplier', base, value: Number(mult) };
  } else if (inPrice && outPrice) {
    provider.models[modelId] = {
      mode: 'absolute',
      input: Number(inPrice),
      output: Number(outPrice),
      ...(cachePrice ? { cache_read: Number(cachePrice) } : {}),
    };
  }
}

writeJson(file, provider);

console.log(`✅ 已创建 data/providers/${id}.json（${KIND_LABEL[kind]}）`);
console.log(`
接下来：
  1. 补全 models：每个模型写 mode=multiplier（倍率，注意 base）+ value，或 mode=absolute + input/output（元/百万）
  2. 有充值赠送就写 recharge: { "pay": 100, "get": 120 }
  3. 有推广链接必须保留 "disclosure": true —— build 会硬校验
  4. 跑 node scripts/build.mjs 看折算结果对不对
  5. 有站点 key 的话加 probe.base_url，并在 GitHub Secrets 的 PROBE_KEYS 里加一项 "${id}": "sk-..." 
`);
