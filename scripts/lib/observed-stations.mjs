/**
 * 把 data/sources.json 里「抓到过、但还没人工录价」的站，变成可以进榜单的行。
 *
 * 规则很简单，也很保守：
 *   1. 只上 verdict === 'ok' 的模型行（输出/输入比与官方同形，说明它真按 token 卖）；
 *   2. 标 kind: relay + risk_flags: ["unverified"] + price_source: "auto"；
 *   3. 已经在 data/providers/ 里人工录过的站一律跳过（人工的覆盖抓的）。
 *
 * 这样榜单不会因为「按次计费」的站被算成 250 倍，也不会盖掉人工核验过的数据。
 */
import { join } from 'node:path';
import { readJson, DATA } from './io.mjs';

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

export function loadObservedStations({ models, knownIds }) {
  const sources = readJson(join(DATA, 'sources.json'), { sources: [] }).sources || [];
  const out = [];

  for (const src of sources) {
    if (!src || src.enabled === false) continue;
    if (knownIds.has(src.id)) continue;

    const snap = readJson(join(DATA, 'observed', `${src.id}.json`), null);
    if (!snap || snap.http_status !== 200) continue;

    const rows = (snap.derivation?.models || []).filter((m) => m.verdict === 'ok' && models[m.id]);
    if (!rows.length) continue;

    out.push({
      id: src.id,
      name: src.name || hostOf(src.homepage) || src.id,
      kind: 'relay',
      homepage: src.homepage || (src.pricing_url ? new URL(src.pricing_url).origin : null),
      pricing_url: src.pricing_url || snap.endpoint || null,
      first_seen: src.first_seen || (snap.fetched_at || '').slice(0, 10) || null,
      risk_flags: ['unverified'],
      observed_only: true,
      observed_at: (snap.fetched_at || '').slice(0, 10) || null,
    });
  }

  return out;
}

/** 逐行判定的索引：站 id → { ok: Set(modelId), why: Map(modelId, 说明), rows_ok, rows_total, class } */
export function loadVerdicts(stationIds) {
  const index = new Map();
  for (const id of stationIds) {
    const snap = readJson(join(DATA, 'observed', `${id}.json`), null);
    if (!snap?.derivation?.models) continue;
    const ok = new Set();
    const why = new Map();
    const mult = new Map();
    for (const m of snap.derivation.models) {
      if (m.verdict === 'ok') {
        ok.add(m.id);
        mult.set(m.id, m.multiple);
      } else {
        why.set(m.id, m.why || m.verdict);
      }
    }
    index.set(id, { ok, why, mult, class: snap.derivation.class, rows_ok: snap.derivation.rows_ok, rows_total: snap.derivation.rows_total });
  }
  return index;
}
