import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, 'style.css'), 'utf8');
const clientJs = readFileSync(join(HERE, 'client.js'), 'utf8');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }) + ' CST';
  } catch {
    return iso;
  }
}

export function renderSite({ meta, rows, models, config }) {
  const site = config.site || {};
  const repo = site.repo || 'YOUR_GITHUB/YOUR_REPO';
  const title = `${site.name || 'Token 雷达'} · AI 中转站 × 官方 价格排行`;
  const description =
    '把 AI API 中转站的「倍率」「充值赠送」折算成真实到手价，和官方直购价格对齐比较。数据由 GitHub Actions 定时抓取，人工核验。';

  const data = JSON.stringify({ meta, rows })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="color-scheme" content="light">
<style>
${css}
</style>
</head>
<body>
<div class="wrap">

  <header class="top">
    <div class="brandline">
      <h1>${esc(site.name || 'Token 雷达')}<span class="dot"> · </span>中转站 × 官方 价格排行</h1>
    </div>
    <p class="tagline">${esc(site.tagline || '')}</p>
    <div class="meta-line">
      <span>更新 <b>${esc(fmtTime(meta.generated_at))}</b></span>
      <span>站点 <b>${meta.counts.stations}</b></span>
      <span>价格行 <b>${meta.counts.rows}</b></span>
      <span>汇率 <b>${esc(meta.fx.usd_cny)}</b></span>
      <span><a href="https://github.com/${esc(repo)}" target="_blank" rel="noopener">GitHub</a></span>
    </div>

    <div class="disclosure"><b>推广披露：</b>${esc(config.disclosure || '')}</div>
    <div class="demo-banner" id="demo-banner" hidden></div>
  </header>

  <section class="kpis" id="kpis"></section>

  <div class="controls">
    <input id="f-q" type="search" placeholder="搜索站点 / 模型…" autocomplete="off">
    <div class="picker" id="f-model-wrap">
      <button type="button" id="f-model" class="picker-btn" aria-haspopup="listbox" aria-expanded="false">
        <span id="f-model-label">全部模型</span><span class="chev" aria-hidden="true"></span>
      </button>
      <div class="picker-pop" id="f-model-pop" role="listbox" hidden>
        <div class="pk-col" id="picker-vendors"></div>
        <div class="pk-col" id="picker-models"></div>
      </div>
    </div>
    <select id="f-kind" aria-label="按类型筛选"></select>
    <select id="f-sort" aria-label="排序方式">
      <option value="discount">按优惠力度排序</option>
      <option value="input">按输入价排序</option>
      <option value="output">按输出价排序</option>
      <option value="cache_read">按缓存价排序</option>
    </select>
    <span class="seg" id="f-cur" role="group" aria-label="计价口径">
      <button type="button" data-cur="usd" class="on" title="站上标的美元牌价：倍率 1.0 就是 0%">美元</button><button type="button" data-cur="cny" title="你实际掏的人民币：按 1 元 = 1 美元额度折算">人民币</button>
    </span>
    <label class="toggle"><input type="checkbox" id="f-demo">显示演示数据</label>
    <label class="toggle"><input type="checkbox" id="f-aff">只看带推广链接</label>
    <span class="count" id="count"></span>
  </div>

  <div class="tablewrap">
    <table>
      <thead>
        <tr>
          <th>站点</th>
          <th>模型</th>
          <th class="num"><span class="th-u">输入 $/百万</span><br><span class="th-sub">现价 / 官方</span></th>
          <th class="num"><span class="th-u">输出 $/百万</span><br><span class="th-sub">现价 / 官方</span></th>
          <th class="num hide-md"><span class="th-u">缓存 $/百万</span><br><span class="th-sub">现价 / 官方</span></th>
          <th class="num">优惠力度</th>
          <th class="num">充值</th>
          <th class="calc-th">计算方式<sup title="以输入价为例；输出价同一套系数">以输入为例</sup></th>
          <th class="hide-md">价格来源</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
  <div class="pager" id="pager"></div>
  ${(meta.disabled_sources || []).length ? `<p class="off-list"><b>已停用 ${(meta.disabled_sources || []).length} 家</b>：${(meta.disabled_sources || []).map((s) => `${esc(s.name)}${s.note ? `（${esc(s.note)}）` : ''}`).join('、')}　不再抓取，也不参与排名。</p>` : ''}

  <section class="method">
    <details open>
      <summary>价格怎么算的（三个坑）</summary>
      <div class="body">
        <p>同一张表里的「0.5 倍率」和「5 折」经常不是一回事，所以本站统一折成<b>人民币 / 百万 token 的到手价</b>再比：</p>
<pre>实际到手价 = 标价 × 计费系数                （充值赠送不计入，单独一列）
优惠力度   = 1 − 混合成本 ÷ 官方混合成本   （百分比越大越优惠，负数表示比官方还贵）
混合成本   = ${meta.blend.input} × 输入价 + ${meta.blend.output} × 输出价   （config.json 可改）</pre>
        <p class="note">表格里每一格，左边是这站的到手价，右边灰字划掉的是官方同口径价格。充值优惠（充 100 得 120）不进价格，单独一栏显示，方便你自己算要充多少；「计算方式」一栏写了每行价格的完整推导，包括用的是哪个分组档位。</p>
        <ul>
          <li><b>坑一：倍率的口径。</b>多数中转站是「1 元 = 1 美元额度」，所以「0.5 倍率」= 官方美元价 × 0.5，<b>以人民币结算</b>，并不乘汇率 —— 这才是「便宜十几倍」的来源。而「官转」通常是按官方<b>人民币</b>价打几折。两种口径在数据里用 <code>base: usd_official | cny_official</code> 区分，混用会算出完全错误的排名。</li>
          <li><b>坑二：充值赠送。</b>「充 100 得 120」等于单价直接打 0.83 折，但很多榜单只抄标价。</li>
          <li><b>坑三：计费虚高。</b>有的站标价极低，但同样的 prompt 报出的 usage 是官方的 1.3 倍以上，实际成本被吃掉。本站的 <code>计费系数</code> 来自定时探活的实测（实测 usage ÷ 本地估算），没有实测时按 1.0 处理。</li>
        </ul>
        <p>另外：官方价本身也有峰谷（DeepSeek 谷时 5 折）、缓存读写价差、以及长上下文加价，这些先按标准档记录，明细看 <code>data/official.json</code>。</p>
      </div>
    </details>
    <details>
      <summary>数据从哪来 / 多久更新</summary>
      <div class="body">
        <ul>
          <li><b>官方价：</b>人工从各厂官方计费页读取，记录 <code>verified_at</code>，来源链接就在 <code>data/official.json</code>。</li>
          <li><b>中转站价：</b>优先人工核验（<code>data/providers/*.json</code>）；支持 new-api / one-api 系的站点会由 GitHub Actions 定时拉取公开的 <code>/api/pricing</code>，标为「自动抓取」，未经核验的行会显示提示。</li>
          <li><b>可用率：</b>定时探活记录到 <code>data/health/</code>（近 7 天成功率），不占榜单列，只作为「计费系数」与人工判断的依据；没有 key 的站点不探活。</li>
          <li>更新频率：每 ${config?.update?.interval_hours ?? 6} 小时，以及每次人工合并 PR 后。</li>
        </ul>
      </div>
    </details>
    <details>
      <summary>为什么必须标注风险</summary>
      <div class="body">
        <p>价格低到一定程度，通常意味着渠道不是官方直连。arXiv 上有一篇对中转站的实测研究（<a href="https://arxiv.org/abs/2603.01919" target="_blank" rel="noopener">Real Money, Fake Models</a>）：在被学术引用过的 17 个中转站里，<b>45.83%</b> 的节点没通过模型身份验证；同一批测试中，部分影子接口在专业问答上的正确率比官方低 40 个百分点以上。价格倍率本身几乎不能预测这种劣化。</p>
        <p>所以这里除了价格，还标 <b>逆向 / 低价陷阱 / 疑似掉包 / 计费虚高</b> 等标签；探活得到的可用率与计费系数在后台记录，直接参与「现价」折算。便宜和稳定，自己权衡。</p>
      </div>
    </details>
    <details>
      <summary>怎么提交新站点 / 纠正价格</summary>
      <div class="body">
        <p>提 PR 改 <code>data/providers/</code> 下的 JSON 即可，一个站点一个文件，格式见 <code>schema/provider.schema.json</code>。规则只有三条：</p>
        <ul>
          <li>价格必须可回溯（给出 <code>pricing_url</code>）。</li>
          <li>有推广链接就必须写 <code>"disclosure": true</code>，构建设置了硬校验。</li>
          <li>排序只按折算后的价格，不按返佣比例、不接受付费提位。</li>
        </ul>
      </div>
    </details>
  </section>

  <footer class="bottom">
    <span>数据来自各站公开页面与公开 API，仅供参考，下单前请自行核对。</span>
    <span><a href="https://github.com/${esc(repo)}" target="_blank" rel="noopener">源码 / 数据</a></span>
    <span>构建于 ${esc(fmtTime(meta.generated_at))}</span>
  </footer>
</div>

<script>window.__DATA__ = ${data};</script>
<script>
${clientJs}
</script>
</body>
</html>
`;
}
