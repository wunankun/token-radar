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
    '把 AI 中转站的「倍率」「美元计价」「订阅套餐」统一折算成人民币到手价，和官方直购价格对齐比较。价格来源逐条标注，可回溯。';

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
      <option value="cache_read">按缓存读价排序</option>
    </select>
    <span class="seg" id="f-cur" role="group" aria-label="计价口径">
      <button type="button" data-cur="usd" class="on" title="站上标的美元牌价：倍率 1.0 就是 0%">美元</button><button type="button" data-cur="cny" title="你实际掏的人民币：按 1 元 = 1 美元额度折算">人民币</button>
    </span>
    <label class="toggle"><input type="checkbox" id="f-demo">显示演示数据</label>
    <span class="count" id="count"></span>
  </div>

  <div class="tablewrap">
    <table>
      <thead>
        <tr>
          <th>站点</th>
          <th class="hide-sm">运营时间</th>
          <th class="hide-sm">计费方式</th>
          <th>模型</th>
          <th class="num"><span class="th-u">输入 $/百万</span><br><span class="th-sub">现价 / 官方</span></th>
          <th class="num"><span class="th-u">输出 $/百万</span><br><span class="th-sub">现价 / 官方</span></th>
          <th class="num hide-md"><span class="th-u">缓存读 $/百万</span><br><span class="th-sub">现价 / 官方</span></th>
          <th class="num">优惠力度</th>
          <th class="calc-th">价格来源</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
  <div class="pager" id="pager"></div>

  ${(() => {
    const cat = meta.catalog;
    if (!cat) return '';
    const auto = JSON.parse(readFileSync(join(HERE, '..', '..', 'data', 'models-auto.json'), 'utf8'));
    const opts = auto.models
      .map((m) => `<option value="${esc(m.id)}">${esc(m.label)} · ${m.coverage} 站${m.baseline ? '' : ' · 无参照价'}</option>`)
      .join('');
    return `<section class="catsec">
    <h2>按模型查价<span class="cat-sub">全站 ${cat.stations} 家里，被 ≥${cat.threshold} 家同时收录的模型共 ${cat.count} 个</span></h2>
    <div class="catbar">
      <input id="cat-q" list="cat-list" placeholder="输入模型名，比如 gpt-6.2-sol、claude-opus-4-8、kimi-k3" autocomplete="off">
      <datalist id="cat-list">${opts}</datalist>
      <button type="button" id="cat-clear">清空</button>
    </div>
    <div id="cat-out" class="cat-out"></div>
  </section>`;
  })()}

  <section class="method">
    <details open>
      <summary>价格怎么算的</summary>
      <div class="body">
        <p>不同站的计价口径不一样，本站统一折成<b>人民币 / 百万 token 的到手价</b>再比。目前有三类：</p>
        <ul>
          <li><b>倍率站</b>（1 元 = 1 美元额度）：人民币单价 = 官方美元价 × 倍率。倍率 0.5 就是官方美元价的 5 折，按人民币付，不再乘汇率。</li>
          <li><b>美元计价站</b>（如 APIVAI）：人民币单价 = 站上美元价 × 汇率（页面顶部显示）。支付宝/微信按当日汇率收人民币，实际成本会略高。</li>
          <li><b>订阅套餐站</b>（OpenCode Go、Fenno）：人民币单价 = 站上 token 单价 × 套餐月费 ÷ 该模型月额度 × 汇率，按<b>用满额度</b>折算；月内用不满，实际单价更高。</li>
        </ul>
<pre>优惠力度 = 1 − 混合成本 ÷ 官方混合成本   （越大越便宜，负数表示比官方贵）
混合成本 = 输入权重 × 输入价 + 输出权重 × 输出价   （权重见 config.json）</pre>
        <p class="note">每个价格格左边是这站的到手价，右边灰字划掉的是官方同口径价格；比官方贵或持平时现价标橙。鼠标悬停能看到这行价格的完整推导（含美元价、汇率、套餐折算），最后的「价格来源」说明它来自官方计费页、OpenRouter 基准价、站上公示，还是套餐换算。</p>
        <ul>
          <li><b>峰谷价</b>：DeepSeek 官方有峰谷，表里统一按谷价算，峰价是谷价的 2 倍，这类行的输入/输出格下方有橙色小字「峰价 ×2」。</li>
          <li><b>订阅制</b>的站按「用满额度」折算，价格看起来低，实际成本取决于用了多少。</li>
          <li><b>充值赠送</b>（充 50 送 30）不计入单价，只写在站点备注里；缓存读价单独一列，缓存写价按输入价的 1.25 倍估算。</li>
        </ul>
      </div>
    </details>
    <details>
      <summary>数据从哪来 / 多久更新</summary>
      <div class="body">
        <ul>
          <li><b>官方价</b>：<code>data/official.json</code>，取自各厂官方计费页；少数模型官方没公开价，用 OpenRouter 的公开挂牌价补充，文件里 <code>source</code> 会标 <code>openrouter</code>。</li>
          <li><b>站点价</b>：<code>data/providers/*.json</code>，人工从站点定价页或公开接口录入，来源链接在 <code>pricing_url</code>；每个站另有一份 <code>data/rules/&lt;id&gt;.md</code>，写清「这家怎么算钱」和待核验项。</li>
          <li><b>更新频率</b>：数据改动后重新构建并发布；自动抓取与探活目前只在手动触发时跑，不承诺实时。</li>
          <li><b>汇率</b>：页面顶部的 USD→CNY 由 <code>config.json</code> 维护，来源与日期一并显示。</li>
          <li><b>未核验</b>：价格按站上公示折算，没有逐家实调账单；发现不一致请提交纠正。</li>
        </ul>
      </div>
    </details>
    <details>
      <summary>为什么必须标注风险</summary>
      <div class="body">
        <p>价格明显低于官方，通常意味着渠道不是官方直连。arXiv 上有一篇对中转站的实测研究（<a href="https://arxiv.org/abs/2603.01919" target="_blank" rel="noopener">Real Money, Fake Models</a>）：在被学术引用过的 17 个中转站里，<b>45.83%</b> 的节点没通过模型身份验证；部分影子接口在专业问答上的正确率比官方低 40 个百分点以上，而价格倍率本身几乎不能预测这种劣化。</p>
        <p>本站只保证「价格能回溯到来源」，不保证模型真假、稳定性和售后；数据里给站点保留风险标签（未核验 / 逆向 / 低价陷阱 / 疑似掉包 / 计费虚高），便宜和稳定请自行权衡。</p>
      </div>
    </details>
    <details>
      <summary>怎么提交新站点 / 纠正价格</summary>
      <div class="body">
        <p>在 GitHub 提 issue 或 PR 都可以。改数据时一个站点一个文件：<code>data/providers/&lt;id&gt;.json</code>（格式见 <code>schema/provider.schema.json</code>），规则档案放 <code>data/rules/&lt;id&gt;.md</code>。三条硬规则：</p>
        <ul>
          <li>价格必须可回溯：给出 <code>pricing_url</code> 或截图来源。</li>
          <li>有推广链接就必须写 <code>"disclosure": true</code>，构建设置了硬校验。</li>
          <li>排序只按折算后的到手价，不按返佣比例，也不接受付费买榜位。</li>
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
