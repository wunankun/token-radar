/**
 * 抓取层：网络请求（超时/重试/并发）、定价接口发现、价格解析、快照对比。
 * 只放纯逻辑 + 网络，不碰文件系统 —— 文件读写和 CLI 在 fetch-pricing.mjs。
 */

import { pickGroup } from './pick-group.mjs';

export const UA = 'token-radar/1.0 (pricing crawler; +https://github.com/wunankun/token-radar)';

export class FetchError extends Error {
  constructor(message, { code = 'fetch', status = null, url = null } = {}) {
    super(message);
    this.name = 'FetchError';
    this.code = code;
    this.status = status;
    this.url = url;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 带超时 + 重试的 GET。
 * 只对「可能恢复」的失败重试：网络错误、408、429、5xx；4xx（除 429）直接失败。
 */
export async function fetchWithRetry(url, opts = {}) {
  const {
    timeout = 15000,
    retries = 2,
    backoff = 700,
    headers = {},
    fetchImpl = globalThis.fetch,
    jitter = 0,
  } = opts;

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoff * attempt + Math.random() * jitter);
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetchImpl(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          accept: 'application/json, text/html;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'user-agent': UA,
          ...headers,
        },
      });
      const text = await res.text();
      const ms = Date.now() - started;

      if (!res.ok) {
        const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
        lastErr = new FetchError(`HTTP ${res.status}`, { code: 'http', status: res.status, url });
        // 403 多半是 Cloudflare 人机验证，重试没意义
        if (!retryable) throw lastErr;
        continue;
      }
      return { ok: true, status: res.status, url, finalUrl: res.url || url, text, ms };
    } catch (err) {
      if (err instanceof FetchError) {
        if (err.code !== 'http' || !(err.status === 408 || err.status === 429 || err.status >= 500)) throw err;
        lastErr = err;
      } else if (err.name === 'AbortError') {
        lastErr = new FetchError(`超时（>${timeout}ms）`, { code: 'timeout', url });
      } else {
        lastErr = new FetchError(`网络错误：${err.message}`, { code: 'network', url });
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** 取 JSON，失败时给出可读原因（HTML 返回通常意味着 403 页面或路径不对） */
export async function fetchJson(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  let json;
  try {
    json = JSON.parse(res.text);
  } catch {
    const preview = res.text.slice(0, 80).replace(/\s+/g, ' ');
    const hint = /<html|<!doctype/i.test(res.text) ? '（返回的是 HTML 页面，可能被拦截或路径不对）' : '';
    throw new FetchError(`不是 JSON${hint}：${preview}`, { code: 'parse', status: res.status, url });
  }
  if (json && json.success === false) {
    throw new FetchError(`接口返回 success:false：${json.message || ''}`, { code: 'api', status: res.status, url });
  }
  return { json, status: res.status, ms: res.ms, url, finalUrl: res.finalUrl };
}

/** 判断一个 payload 像不像 new-api / one-api 的定价表 */
export function looksLikePricing(payload) {
  try {
    const { models } = parsePricing(payload, { resolveModel: () => 'x' });
    return Object.keys(models).length > 0;
  } catch {
    return false;
  }
}

/**
 * 找出站点的定价接口。
 * 顺序：/api/pricing → /api/pricing/ → 首页 HTML 里出现的 /api/pricing 链接（可能指向 api.子域）。
 * 返回 { url, payload, status, ms } 或 null。
 */
export async function discoverPricing(homepageOrOrigin, opts = {}) {
  const origin = normalizeOrigin(homepageOrOrigin);
  if (!origin) throw new FetchError(`不是合法 URL：${homepageOrOrigin}`, { code: 'input' });

  for (const path of ['/api/pricing', '/api/pricing/']) {
    const url = origin + path;
    try {
      const { json, status, ms } = await fetchJson(url, opts);
      if (looksLikePricing(json)) return { url, payload: json, status, ms };
    } catch {
      /* 继续找 */
    }
  }

  // 回退：抓首页，从 JS/HTML 里找定价接口地址
  try {
    const { text, finalUrl } = await fetchWithRetry(origin, { ...opts, headers: { accept: 'text/html' } });
    const found = new Set();
    for (const m of text.matchAll(/["'`(]((?:https?:\/\/[^"'`\s)]+)?\/api\/pricing\/?)(?:["'`)?])/g)) {
      found.add(m[1]);
    }
    for (const hit of found) {
      const url = /^https?:/.test(hit) ? hit : new URL(hit, finalUrl || origin).href;
      try {
        const { json, status, ms } = await fetchJson(url, opts);
        if (looksLikePricing(json)) return { url, payload: json, status, ms };
      } catch {
        /* 下一个 */
      }
    }
  } catch {
    /* 首页也拿不到就算了 */
  }
  return null;
}

export function normalizeOrigin(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : 'https://' + s;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * 解析 new-api / one-api 的定价表。
 *
 * 面值换算：one-api 口径 1 USD = 500,000 quota ⇒ USD/百万 token = model_ratio × 2。
 * 再乘分组倍率 group_ratio。倍数型站点里这正好等于「官方美元价 × 倍率」。
 *
 * @returns {{format:string, groupRatio:number, models:Object, unmatched:Array, stats:Object}}
 */
// /api/status 里藏着「这家站的钱怎么算」的关键参数：1 美元额度要多少人民币、
// 充值入口在哪、货币符号是什么。抓不到就算了，不影响价格解析。
export async function fetchStatus(origin, opts = {}) {
  try {
    const got = await fetchWithRetry(origin.replace(/\/+$/, '') + '/api/status', { timeout: 8000, retries: 0, ...opts });
    const j = JSON.parse(got.text);
    const d = j?.data || j;
    if (!d || typeof d !== 'object') return null;
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    return {
      usd_exchange_rate: num(d.usd_exchange_rate ?? d.usdExchangeRate),
      quota_per_unit: num(d.quota_per_unit),
      price: num(d.price),
      currency: d.custom_currency_symbol || d.currency || null,
      top_up_link: d.top_up_link || null,
      system_name: d.system_name || null,
      version: d.version || null,
    };
  } catch {
    return null;
  }
}

export function parsePricing(payload, { resolveModel = (n) => n, groupRatioOverride = null } = {}) {
  const list = extractList(payload);
  if (!list.length) throw new Error('没找到价格数组（payload.data 为空或结构不认识）');

  const groupRatio = groupRatioOverride ?? guessGroupRatio(payload) ?? 1;
  const meta = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const usable = meta?.usable_group && typeof meta.usable_group === 'object'
    ? Object.fromEntries(Object.entries(meta.usable_group).slice(0, 80).map(([k, v]) => [k, clean(v)]))
    : {};
  const extras = {
    ...(Array.isArray(meta?.auto_groups) && meta.auto_groups.length ? { auto_groups: meta.auto_groups.slice(0, 20) } : {}),
    ...(meta?.base_group_ratio && typeof meta.base_group_ratio === 'object' ? { base_group_ratio: meta.base_group_ratio } : {}),
    ...(Object.keys(usable).length ? { usable_group: usable } : {}),
    ...(meta?.pricing_version ? { pricing_version: String(meta.pricing_version) } : {}),
  };
  // 选档需要的东西：分组倍率表 + 站点声明的自动分组 + 分组说明
  const snapLike = {
    group_ratios: (meta && typeof meta.group_ratio === 'object' ? meta.group_ratio : {}) || {},
    auto_groups: extras.auto_groups || [],
    usable_group: usable,
    group_ratio: groupRatio,
  };

  const models = {};
  const all = [];
  const unmatched = [];
  const stats = { total: list.length, matched: 0, per_call: 0, no_ratio: 0, duplicate: 0 };

  for (const item of list) {
    const name = item.model_name || item.model || item.name || item.id;
    if (!name) continue;

    // 按次计费（图片/视频类）没有 token 单价
    const quotaType = Number(item.quota_type);
    if (quotaType === 1 || (item.model_price != null && Number(item.model_price) > 0 && !item.model_ratio)) {
      stats.per_call++;
      continue;
    }

    const ratio = Number(item.model_ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      stats.no_ratio++;
      continue;
    }
    const completion = Number(item.completion_ratio) || 1;
    const picked = pickGroup(snapLike, { enable_groups: item.enable_groups });
    // models[] 保持「站点默认档」口径（公式可审计）；catalog 里另外记每个模型自己选中的档 g
    const gr = Number.isFinite(Number(item.group_ratio)) && Number(item.group_ratio) > 0 ? Number(item.group_ratio) : groupRatio;

    const input = ratio * 2 * gr;
    const output = input * completion;
    // 全量目录：不管能不能对上标准模型，都记下来（data/catalog/<id>.json 用来统计全站模型供给）
    all.push({
      n: name,
      r: round(ratio),
      c: round(completion),
      cr: Number.isFinite(Number(item.cache_ratio)) && Number(item.cache_ratio) > 0 ? round(Number(item.cache_ratio)) : null,
      g: round(gr),
      gn: picked.name,
    });
    const cacheRatio = Number(item.cache_ratio);
    const cache_read = Number.isFinite(cacheRatio) && cacheRatio > 0 ? round(input * cacheRatio) : null;

    const id = resolveModel(name);
    if (!id) {
      unmatched.push({ model_name: name, model_ratio: ratio, completion_ratio: completion });
      continue;
    }
    if (models[id]) {
      stats.duplicate++;
      continue;
    }
    stats.matched++;
    models[id] = {
      input: round(input),
      output: round(output),
      cache_read,
      raw: {
        model_name: name,
        model_ratio: ratio,
        completion_ratio: completion,
        group_ratio: gr,
        quota_type: quotaType || 0,
        ...(Number.isFinite(cacheRatio) && cacheRatio > 0 ? { cache_ratio: cacheRatio } : {}),
        ...(Array.isArray(item.enable_groups) && item.enable_groups.length
          ? { enable_groups: item.enable_groups.slice(0, 40) }
          : {}),
        ...(item.billing_mode ? { billing_mode: String(item.billing_mode) } : {}),
        ...(item.billing_expr ? { billing_expr: String(item.billing_expr).slice(0, 180) } : {}),
      },
    };
  }

  return { format: 'new-api/one-api', groupRatio, models, all, unmatched, stats, extras };
}

function extractList(payload) {
  if (Array.isArray(payload)) return payload;
  const d = payload?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(payload?.models)) return payload.models;
  if (d && typeof d === 'object') {
    return Object.entries(d)
      .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
      .map(([k, v]) => ({ model_name: k, ...v }));
  }
  if (payload && typeof payload === 'object' && Number.isFinite(Number(payload.model_ratio))) {
    return [{ ...payload, model_name: payload.model_name || payload.model }];
  }
  return [];
}

function guessGroupRatio(payload) {
  const g = payload?.group_ratio ?? payload?.data?.group_ratio;
  if (Number.isFinite(Number(g))) return Number(g);
  if (g && typeof g === 'object') {
    const first = Number(g.default ?? g.default_group ?? Object.values(g)[0]);
    if (Number.isFinite(first)) return first;
  }
  return null;
}

const round = (n) => Math.round(n * 10000) / 10000;

/**
 * 对比两次快照，找出价格变化。小于 minPct（百分比）的波动忽略，防止浮点噪声刷屏。
 * @returns {{added:string[], removed:string[], changed:Array}}
 */
export function diffSnapshots(prev, next, { minPct = 0.1 } = {}) {
  const before = prev?.models || {};
  const after = next?.models || {};
  const added = Object.keys(after).filter((k) => !before[k]);
  const removed = Object.keys(before).filter((k) => !after[k]);
  const changed = [];

  for (const id of Object.keys(after)) {
    if (!before[id]) continue;
    for (const field of ['input', 'output', 'cache_read']) {
      const from = before[id][field];
      const to = after[id][field];
      if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) continue;
      const pct = from === 0 ? Infinity : ((to - from) / from) * 100;
      if (Math.abs(pct) < minPct) continue;
      changed.push({ id, field, from, to, pct: Math.round(pct * 10) / 10 });
    }
  }
  return { added, removed, changed };
}

/** 固定并发的任务池，返回与输入同序的结果；单个任务抛错记为 {error}。 */
export async function runPool(items, worker, { concurrency = 4 } = {}) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.max(1, Math.min(concurrency, items.length))).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (err) {
        results[i] = { ok: false, error: err };
      }
    }
  });
  await Promise.all(runners);
  return results;
}
