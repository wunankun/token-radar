import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import {
  diffSnapshots,
  discoverPricing,
  fetchJson,
  fetchWithRetry,
  normalizeOrigin,
  parsePricing,
  runPool,
} from '../scripts/lib/crawl.mjs';

const resolver = (map) => (name) => map[name] || null;

/* ---------------- 解析 ---------------- */

test('parsePricing：数组形态 + 分组倍率 + 缓存价 + 按次计费跳过', () => {
  const payload = {
    success: true,
    group_ratio: { default: 0.9 },
    data: [
      { model_name: 'gpt-6.2-sol', model_ratio: 1, completion_ratio: 5, cache_ratio: 0.1 },
      { model_name: 'claude-sonnet-5-5', model_ratio: 1, completion_ratio: 5, group_ratio: 2 },
      { model_name: 'dall-e-99', model_ratio: 0, model_price: 0.04, quota_type: 1 },
      { model_name: 'mystery-model', model_ratio: 3, completion_ratio: 2 },
    ],
  };
  const parsed = parsePricing(payload, { resolveModel: resolver({ 'gpt-6.2-sol': 'gpt-6.2-sol', 'claude-sonnet-5-5': 'claude-sonnet-5-5' }) });

  // 1 × 2 × 0.9 = 1.8（USD/百万），输出再 × 5
  assert.deepEqual(parsed.models['gpt-6.2-sol'], {
    input: 1.8,
    output: 9,
    cache_read: 0.18,
    raw: {
      model_name: 'gpt-6.2-sol',
      model_ratio: 1,
      completion_ratio: 5,
      group_ratio: 0.9,
      quota_type: 0,
      cache_ratio: 0.1,
    },
  });
  // 单模型 group_ratio 覆盖全局
  assert.equal(parsed.models['claude-sonnet-5-5'].input, 4);
  assert.equal(parsed.models['claude-sonnet-5-5'].cache_read, null);
  // 按次计费被跳过，而不是算成 0
  assert.equal(parsed.stats.per_call, 1);
  assert.equal(parsed.stats.matched, 2);
  assert.deepEqual(parsed.unmatched.map((u) => u.model_name), ['mystery-model']);
  assert.equal(parsed.groupRatio, 0.9);
});

test('parsePricing：data 是对象映射（部分 one-api 分支）', () => {
  const payload = { data: { 'deepseek-flash': { model_ratio: 0.15, completion_ratio: 4 } } };
  const parsed = parsePricing(payload, { resolveModel: resolver({ 'deepseek-flash': 'deepseek-flash' }) });
  assert.equal(parsed.models['deepseek-flash'].input, 0.3);
  assert.equal(parsed.models['deepseek-flash'].output, 1.2);
});

test('parsePricing：结构不认识时抛错，而不是静默返回空', () => {
  assert.throws(() => parsePricing({ hello: 'world' }), /没找到价格数组/);
  assert.throws(() => parsePricing(null), /没找到价格数组/);
});

/* ---------------- 快照对比 ---------------- */

test('diffSnapshots：涨价/降价/新增/下线/忽略噪声', () => {
  const prev = { models: { a: { input: 2, output: 10 }, b: { input: 1, output: 4 }, c: { input: 3, output: 6 } } };
  const next = { models: { a: { input: 2.4, output: 10 }, b: { input: 1.0002, output: 4 }, d: { input: 5, output: 20 } } };
  const d = diffSnapshots(prev, next);
  assert.deepEqual(d.added, ['d']);
  assert.deepEqual(d.removed, ['c']);
  assert.deepEqual(d.changed, [{ id: 'a', field: 'input', from: 2, to: 2.4, pct: 20 }]);
});

test('diffSnapshots：首次抓取（没有上一版）不报变化', () => {
  const d = diffSnapshots(undefined, { models: { a: { input: 1, output: 2 } } });
  assert.deepEqual(d, { added: ['a'], removed: [], changed: [] });
});

/* ---------------- URL ---------------- */

test('normalizeOrigin：补协议、去路径、拒绝非法值', () => {
  assert.equal(normalizeOrigin('example.com/abc'), 'https://example.com');
  assert.equal(normalizeOrigin('http://a.example.com:8080/x/y'), 'http://a.example.com:8080');
  assert.equal(normalizeOrigin('   '), null);
  assert.equal(normalizeOrigin('not a url'), null);
});

/* ---------------- 并发池 ---------------- */

test('runPool：保持输入顺序，单个失败不影响其他', async () => {
  const items = [1, 2, 3, 4, 5];
  const out = await runPool(
    items,
    async (n) => {
      await new Promise((r) => setTimeout(r, (6 - n) * 5));
      if (n === 3) throw new Error('boom');
      return n * 10;
    },
    { concurrency: 2 }
  );
  assert.equal(out[0].value, 10);
  assert.equal(out[2].ok, false);
  assert.equal(out[2].error.message, 'boom');
  assert.equal(out[4].value, 50);
});

/* ---------------- 网络（本地假站点） ---------------- */

async function withServer(handler, fn) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.closeAllConnections?.(); // 一次性断掉 keep-alive，否则要等 5s
    server.close();
    await once(server, 'close');
  }
}

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

test('fetchJson：遇到 HTML 返回时给出可读原因', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!DOCTYPE html><html>Just a moment…</html>');
  }, async (base) => {
    await assert.rejects(() => fetchJson(base + '/api/pricing', { retries: 0 }), /不是 JSON（返回的是 HTML 页面/);
  });
});

test('fetchJson：403 不重试，直接失败', async () => {
  let hits = 0;
  await withServer((req, res) => {
    hits++;
    json(res, { error: 'blocked' }, 403);
  }, async (base) => {
    await assert.rejects(() => fetchJson(base + '/api/pricing', { retries: 3, backoff: 1 }), /HTTP 403/);
    assert.equal(hits, 1);
  });
});

test('fetchWithRetry：5xx 会重试，最终成功', async () => {
  let hits = 0;
  await withServer((req, res) => {
    hits++;
    if (hits < 3) return json(res, { oops: true }, 503);
    json(res, { ok: true });
  }, async (base) => {
    const r = await fetchJson(base + '/api/pricing', { retries: 3, backoff: 1 });
    assert.deepEqual(r.json, { ok: true });
    assert.equal(hits, 3);
  });
});

test('fetchWithRetry：超时会中止', async () => {
  let closed;
  const done = new Promise((r) => (closed = r));
  await withServer((req, res) => {
    res.on('close', closed);
  }, async (base) => {
    await assert.rejects(
      () => fetchWithRetry(base + '/api/pricing', { timeout: 120, retries: 0 }),
      (err) => err.code === 'timeout'
    );
    await done;
  });
});

test('fetchJson：success:false 视为接口错误', async () => {
  await withServer((req, res) => json(res, { success: false, message: '无权访问' }), async (base) => {
    await assert.rejects(() => fetchJson(base + '/api/pricing', { retries: 0 }), /success:false.*无权访问/);
  });
});

test('discoverPricing：直接命中 /api/pricing', async () => {
  await withServer((req, res) => {
    if (req.url === '/api/pricing') return json(res, { data: [{ model_name: 'gpt-6.2-sol', model_ratio: 1, completion_ratio: 5 }] });
    res.writeHead(404);
    res.end('nope');
  }, async (base) => {
    const found = await discoverPricing(base, { retries: 0 });
    assert.equal(found.url, base + '/api/pricing');
    assert.equal(parsePricing(found.payload).stats.total, 1);
  });
});

test('discoverPricing：从首页里挖出定价接口地址', async () => {
  await withServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<script>fetch("/api/pricing").then(r=>r.json())</script>');
    }
    if (req.url === '/api/pricing') return json(res, { data: [{ model_name: 'x', model_ratio: 2, completion_ratio: 1 }] });
    res.writeHead(404);
    res.end('');
  }, async (base) => {
    const found = await discoverPricing(base, { retries: 0 });
    assert.equal(found.url, base + '/api/pricing');
  });
});

test('discoverPricing：什么都没有时返回 null', async () => {
  await withServer((req, res) => {
    res.writeHead(404);
    res.end('<html>404</html>');
  }, async (base) => {
    assert.equal(await discoverPricing(base, { retries: 0, timeout: 300 }), null);
  });
});
