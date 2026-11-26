import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA = join(ROOT, 'data');
export const DIST = join(ROOT, 'dist');

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`找不到文件: ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${path} 不是合法 JSON: ${err.message}`);
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function listJson(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(dir, f));
}

/** 读 health/<id>.json 并算出 7/30 天可用率、最近一次成功时间、平均延迟 */
export function loadHealth(stationId) {
  const file = join(DATA, 'health', `${stationId}.json`);
  if (!existsSync(file)) return null;
  const data = readJson(file, { days: [] });
  const days = (data.days || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!days.length) return null;
  const now = Date.now();
  const inWindow = (n) => days.filter((d) => now - Date.parse(d.date) <= n * 86400000);
  const uptime = (arr) => (arr.length ? arr.filter((d) => d.ok).length / arr.length : null);
  const lat = days.filter((d) => d.ok && Number.isFinite(d.latency_ms)).map((d) => d.latency_ms);
  const usage = days.find((d) => Number.isFinite(d.usage_ratio));
  return {
    days: days.length,
    uptime_7d: uptime(inWindow(7)),
    uptime_30d: uptime(inWindow(30)),
    last_ok: days.find((d) => d.ok)?.date ?? null,
    last_checked: days[0]?.date ?? null,
    latency_ms: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
    usage_ratio: usage ? usage.usage_ratio : null,
  };
}

export function loadAll() {
  const config = readJson(join(ROOT, 'config.json'));
  const models = readJson(join(DATA, 'models.json'));
  const official = readJson(join(DATA, 'official.json'));

  const providers = listJson(join(DATA, 'providers')).map((p) => readJson(p));
  const observed = new Map();
  for (const file of listJson(join(DATA, 'observed'))) {
    const o = readJson(file);
    if (o?.station_id) observed.set(o.station_id, o);
  }
  return { config, models, official, providers, observed };
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}
