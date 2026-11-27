/* Token 雷达 · 前端渲染（无依赖，数据来自 window.__DATA__） */
(function () {
  'use strict';

  var DATA = window.__DATA__ || { rows: [], meta: {} };
  var rows = DATA.rows || [];
  var meta = DATA.meta || {};
  var W = meta.blend || { input: 0.7, output: 0.3 };

  var state = { q: '', model: '', kind: '', sort: 'discount', showDemo: false, currency: 'usd', page: 1, perPage: 50 };

  // 当前计价口径：美元 = 站上标的美元牌价（倍率 1.0 → 0%）；人民币 = 你实际掏的钱（1 元 = 1 美元额度）
  // 厂商真 logo：OpenAI / Anthropic / DeepSeek / Kimi / Qwen 取 simple-icons 的 path，
  // 智谱取官网 logo 的四片星形；全部内联，不引外链图片。
  var BRAND = {
    OpenAI:    { label: 'GPT',      color: '#0d0d0d', vb: '0 0 24 24', d: ['M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z'] },
    Anthropic: { label: 'Claude',   color: '#d97757', vb: '0 0 24 24', d: ['M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z'] },
    DeepSeek:  { label: 'DeepSeek', color: '#4d6bfe', vb: '0 0 24 24', d: ['M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45'] },
    Moonshot:  { label: 'Kimi', vb: '0 0 1024 1024', k: 0.92, eo: true, d: ['M731.456 0A292.544 292.544 0 0 1 1024 292.544v438.912A292.608 292.608 0 0 1 731.456 1024H292.48A292.544 292.544 0 0 1 0 731.456V292.48A292.544 292.544 0 0 1 292.544 0h438.912z m-448 731.456h82.24v-95.04l73.152-72.448L635.456 708.8c0.576 0.448 32.384 22.656 77.696 22.656v-95.04c-27.264 0-40.96-8.96-41.152-9.024l-173.696-126.72 214.848-208.128h-123.52l-224 217.216V292.48H283.52v438.912zM800 192a50.304 50.304 0 0 0-50.304 50.304v50.24H800A50.304 50.304 0 1 0 800 192z'] },
    Alibaba:   { label: 'Qwen',     color: '#615ced', vb: '0 0 24 24', d: ['M23.919 14.545 20.817 9.17l1.47-2.544a.56.56 0 0 0 0-.566l-1.633-2.83a.57.57 0 0 0-.49-.283h-6.207L12.487.402a.57.57 0 0 0-.49-.284H8.732a.56.56 0 0 0-.49.284L5.139 5.775h-2.94a.56.56 0 0 0-.49.284L.077 8.887a.56.56 0 0 0 0 .567L3.18 14.83l-1.47 2.545a.56.56 0 0 0 0 .566l1.634 2.83a.57.57 0 0 0 .49.283h6.205l1.47 2.545a.57.57 0 0 0 .49.284h3.266a.57.57 0 0 0 .49-.284l3.104-5.375h2.94a.57.57 0 0 0 .49-.283l1.634-2.828a.55.55 0 0 0-.004-.568M8.733.686l1.634 2.828-1.634 2.828H21.8L20.164 9.17H7.425L5.63 6.06Zm1.306 19.801-6.205-.002 1.634-2.83h3.265L2.201 6.344h3.267q3.182 5.517 6.367 11.032zm10.124-5.66L18.53 12l-6.532 11.315-1.634-2.83c2.129-3.673 4.25-7.351 6.373-11.028h3.592l3.102 5.374z'] },
    Tencent:   { label: 'Hy', vb: '0 0 1024 1024', k: 1.12, c: ['#d9d9d9', '#111', '#8a8a8a', '#111'], d: ['M461.88544 887.36256l-9.79456-370.688C432.384 509.44 512 415.744 544.70656 424.00256c95.872-24.12544 200.12544-176.70656 9.856-289.92-575.74912 0-512.64 707.90144-92.67712 753.28z', 'M460.032 887.168c-171.52-39.424-339.456-279.424-134.08256-494.91456 47.16544-41.6-47.04256-164.28544-124.22656-96.64C-3.328 579.2 266.368 887.936 460.032 887.168z', 'M432.384 530.49344c-4.736 3.39456 0-1.98144 0 0z m0 0v29.568c0 3.90656-5.504 30.14656-7.87456 41.40544l29.568 63.104s19.712 5.888 21.69344 7.87456c1.92 1.92 11.648 3.32288 15.744 3.96288l41.41056 25.6 69.05344-9.856L690.688 664.576l82.816-71.04 25.6-43.32544 21.76-110.464-3.968-51.2v-45.44l-45.37344-82.75456-23.68-29.63456-41.344-37.44256-35.52256-21.69344-9.856-5.888-11.84256-3.968-21.69344-7.87456-68.992-17.72544c149.82656 49.28 161.664 201.088 118.27712 274.048-43.264 73.02656-137.344 115.07712-228.67456 106.496l-15.81056 13.824z', 'M471.808 887.424c134.08256 35.456 427.776-92.544 423.936-366.78656 9.856-122.24-104.32-365.50656-289.92-374.656 206.976 42.112 286.01344 422.20544 17.85344 516.60288-134.144 33.54112-183.424-68.992-173.568-141.952-137.984 6.97344-211.2 302.848 21.69344 366.72v0.07168z'] },
    Google:    { label: 'Gemini', vb: '0 0 1024 1024', k: 1, d: ['M938.496 512.768c-228.864 13.824-411.989333 196.949333-425.813333 425.813333h-1.706667c-13.653333-228.864-196.821333-411.989333-425.642667-425.813333v-1.706667c228.821333-13.653333 411.989333-196.821333 425.813334-425.642666h1.706666c13.824 228.821333 196.992 411.989333 425.813334 425.813333v1.536h-0.170667z'] },
    Zhipu:     { label: 'GLM',      seam: 1.9, k: 0.98, vb: '0 0 21.05 24', d: [
      'M21.0517 11.7895V5.91559C21.0517 5.89816 21.0422 5.88207 21.0268 5.87346L10.5497 0.00632824C10.5422 0.00210946 10.5338 2.92206e-08 10.5254 0V2.45801C10.5254 7.22726 14.5109 11.784 19.4278 11.784C19.3287 11.784 19.2299 11.7858 19.1316 11.7895H21.0517Z',
      'M-0.000925064 11.7895V17.8731C-0.000925064 17.8912 0.00857449 17.9079 0.0239525 17.9168L10.5011 23.9934C10.5086 23.9978 10.517 24 10.5254 24V21.4542C10.5254 16.5146 6.53987 11.7952 1.62302 11.7952C1.72212 11.7952 1.82085 11.7933 1.91917 11.7895H-0.000925064Z',
      'M-0.000925064 11.7895V5.91559C-0.000925064 5.89816 0.00857449 5.88207 0.0239525 5.87346L10.5011 0.00632824C10.5086 0.00210946 10.517 2.92206e-08 10.5254 0V2.45801C10.5254 7.22726 6.53987 11.784 1.62302 11.784C1.72212 11.784 1.82085 11.7858 1.91917 11.7895H-0.000925064Z',
      'M21.0517 11.7895V17.8731C21.0517 17.8912 21.0422 17.9079 21.0268 17.9168L10.5497 23.9934C10.5422 23.9978 10.5338 24 10.5254 24V21.4542C10.5254 16.5146 14.5109 11.7952 19.4278 11.7952C19.3287 11.7952 19.2299 11.7933 19.1316 11.7895H21.0517Z',
      'M10.5273 2.45801C10.5273 7.22725 14.5129 11.7842 19.4297 11.7842L19.1338 11.7891C19.232 11.7929 19.3307 11.7949 19.4297 11.7949C14.5129 11.7949 10.5274 16.5146 10.5273 21.4541C10.5273 16.5581 6.61178 11.8801 1.75488 11.7979L1.75391 11.792L1.9209 11.7891C1.86537 11.787 1.80969 11.7869 1.75391 11.7861V11.7803C6.61128 11.7015 10.5273 7.18549 10.5273 2.45801Z'
    ] }
  };
  function vlabel(vendor) { var b = BRAND[vendor]; return b ? b.label : (vendor || '其他'); }
  function vico(vendor) {
    var b = BRAND[vendor];
    if (!b || !b.d) return '<span class="vico vico-fb" aria-hidden="true">' + esc(b && b.mono ? b.mono : (vendor || '?').slice(0, 2)) + '</span>';
    var k = b.k || 1;
    var px = Math.max(10, Math.round(15 * k));
    var st = '';
    if (b.eo) st += ' fill-rule="evenodd"';
    if (b.seam) st += ' style="stroke:var(--bg);stroke-width:' + b.seam + ';stroke-linejoin:round"';
    return '<span class="vico2" aria-hidden="true"><svg viewBox="' + b.vb +
      '" width="' + px + '" height="' + px + '" fill="currentColor"' + st + '>' +
      b.d.map(function (d, i) {
        var c = b.c && b.c[i];
        return '<path d="' + d + '"' + (c ? ' fill="' + c + '"' : '') + '/>';
      }).join('') + '</svg></span>';
  }

  var CUR = {
    usd: { unit: '$', eff: 'usd' },
    cny: { unit: '¥', eff: 'cny' },
  };
  function view(r) {
    if (state.currency === 'usd' && r.usd) {
      return { input: r.usd.effective.input, output: r.usd.effective.output, cache_read: r.usd.effective.cache_read, off: r.usd.official, disc: r.usd.discount, blend: r.usd.blend };
    }
    return { input: r.effective.input, output: r.effective.output, cache_read: r.effective.cache_read, off: r.official_cny, disc: r.discount, blend: r.blend_effective };
  }
  function unit() { return CUR[state.currency].unit; }

  // 模型目录：meta.models 已按 OpenRouter token 消耗排行升序（rank 小的在前）
  var MODELS = {};
  (meta.models || []).forEach(function (m) {
    MODELS[m.id] = {
      id: m.id,
      label: m.label,
      vendor: m.vendor,
      popularity: m.popularity || 0,
      coverage: m.coverage || 0,
      usage: m.usage || null,
      order: m.order || 0,
    };
  });
  var $ = function (sel) { return document.querySelector(sel); };

  /* ---------- 格式化 ---------- */
  function money(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    if (v === 0) return '0';
    if (v < 0.1) return String(parseFloat(v.toFixed(4)));
    if (v < 1) return String(parseFloat(v.toFixed(3)));
    return String(parseFloat(v.toFixed(2)));
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 优惠力度：0.854 = 便宜 85.4%；负数 = 比官方贵 */
  function discCls(d) {
    if (d === null || d === undefined) return 'd-na';
    if (Math.abs(d) < 0.005) return 'd-flat';
    if (d < 0) return 'd-neg';
    if (d < 0.3) return 'd-low';
    if (d < 0.6) return 'd-mid';
    if (d < 0.8) return 'd-good';
    return 'd-best';
  }
  function discText(d) {
    if (d === null || d === undefined) return '—';
    var p = d * 100;
    if (Math.abs(p) < 0.5) return '0%';
    if (p < 0) return '贵 ' + Math.abs(p).toFixed(0) + '%';
    return (p >= 99.4 ? '99.6' : p >= 10 ? p.toFixed(0) : p.toFixed(1)) + '%';
  }

  /* 官方价的同口径混合成本（只用于排序和优惠力度，不单独占列） */
  function offBlend(r) {
    if (state.currency === 'usd' && r.usd && r.usd.official) {
      return r.usd.official.input * W.input + r.usd.official.output * W.output;
    }
    return officialBlend(r);
  }
  function officialBlend(r) {
    var o = r.official_cny;
    if (!o || o.input == null || o.output == null) return null;
    return o.input * W.input + o.output * W.output;
  }

  /* 一格两组数：左边现价，右边划掉的官方价 */
  // 运营时间：只有中转站有，官方直购留空
  function opCell(r) {
    if (r.station.kind === 'official') return '<span class="muted">—</span>';
    var since = r.station.operating_since;
    if (!since) return '<span class="muted" title="还没记录开业时间，发截图给维护 agent 建档">—</span>';
    var t = Date.parse(since + (since.length === 7 ? '-01' : ''));
    var title = '开业于 ' + since;
    if (isFinite(t)) {
      var months = Math.max(0, Math.floor((Date.now() - t) / 2592000000));
      if (months > 0) title += '（约 ' + (months >= 12 ? Math.floor(months / 12) + ' 年' + (months % 12 ? ' ' + (months % 12) + ' 个月' : '') : months + ' 个月') + '）';
    }
    return '<span title="' + esc(title) + '">' + esc(since) + '</span>';
  }

  function pairCell(now, off, tip, isOfficial) {
    if (now === null || now === undefined) return '<span class="muted">—</span>';
    // 官方价一律划掉变灰；持平或更贵时现价标橙提醒「这家不便宜」
    var hasOff = !isOfficial && off !== null && off !== undefined;
    var cheaper = hasOff && now < off - 1e-9;
    var cls = 'unit' + (hasOff && !cheaper ? ' unit-warn' : '');
    var title = (tip || '') + (hasOff && !cheaper ? '（比官方贵或持平，标橙）' : '');
    var html = '<span class="' + cls + '" title="' + esc(title) + '">' + money(now) + '</span>';
    // 官方价一律划掉变灰；便宜时是「省了多少」的对照，贵/持平时是「贵过基准」的对照
    if (hasOff) {
      html += '<span class="offp" title="官方同口径">' + money(off) + '</span>';
    }
    return html;
  }

  /* ---------- KPI ---------- */
  function renderKpis() {
    var c = meta.counts || {};
    var best = null;
    rows.forEach(function (r) {
      if (r.station.demo || r.station.kind === 'official') return;
      var v = view(r);
      if (v.disc == null) return;
      if (!best || v.disc > best.disc) best = { disc: v.disc, station: r.station.name, model: r.model.label };
    });
    var bestDemoOnly = false;
    var autoRows = rows.filter(function (r) { return r.price_source === 'auto'; });
    var autoStations = {};
    autoRows.forEach(function (r) { autoStations[r.station.id] = 1; });
    var autoSt = Object.keys(autoStations).length;
    var aff = rows.filter(function (r) { return r.station.affiliate_url && !r.station.demo; }).length;

    var cards = [
      {
        k: '在录规模', v: String(c.stations || 0), small: '个站点',
        s: (c.models || 0) + ' 个模型 · ' + (c.rows || 0) + ' 行价格'
      },
      {
        k: '最高优惠力度', accent: true,
        v: best && best.disc != null ? discText(best.disc) : '—',
        s: best
          ? (bestDemoOnly ? '演示：' : '') + esc(best.station) + ' · ' + esc(best.model)
          : '录入真实中转站后自动计算'
      },
      {
        k: '汇率 USD→CNY', v: String((meta.fx && meta.fx.usd_cny) || '—'),
        s: (meta.fx && meta.fx.source ? '抓自 ' + esc(meta.fx.source) + ' · ' + esc(meta.fx.as_of || '') : '手工维护') +
        (state.currency === 'usd' ? ' · 美元口径按此把人民币实付折成美元' : ' · 人民币口径就是实付')
      },
      {
        k: '推广链接', v: String(aff), small: '行',
        s: autoSt
          ? ('另有 ' + autoSt + ' 个站自动抓取，' + autoRows.length + ' 行待核验')
          : '全部为人工核验价格'
      }
    ];

    $('#kpis').innerHTML = cards.map(function (card) {
      return '<div class="kpi' + (card.accent ? ' accent' : '') + '">' +
        '<div class="k">' + card.k + '</div>' +
        '<div class="v">' + card.v + (card.small ? '<small>' + card.small + '</small>' : '') + '</div>' +
        '<div class="s">' + card.s + '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------- 筛选 + 排序 ---------- */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (!state.showDemo && r.station.demo) return false;
      if (state.model) {
        if (state.model.indexOf('vendor:') === 0) {
          if (r.model.vendor !== state.model.slice(7)) return false;
        } else if (r.model.id !== state.model) {
          return false;
        }
      }
      if (state.kind && r.station.kind !== state.kind) return false;
      if (q) {
        var hay = (r.station.name + ' ' + r.model.label + ' ' + r.model.id + ' ' + r.model.vendor + ' ' + r.station.kind_label).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      var va = view(a);
      var vb = view(b);
      if (state.sort === 'discount') {
        var av = va.disc == null ? -Infinity : va.disc;
        var bv = vb.disc == null ? -Infinity : vb.disc;
        if (Math.abs(bv - av) > 0.0005) return bv - av;
        var ua = usageRank(a.model.id);
        var ub = usageRank(b.model.id);
        return ua - ub;
      }
      var an = va[state.sort] != null ? va[state.sort] : Infinity;
      var bn = vb[state.sort] != null ? vb[state.sort] : Infinity;
      return an - bn;
    });
  }

  /* ---------- 行 ---------- */
  function stationCell(r) {
    var s = r.station;
    var name = esc(s.name);
    var link = s.affiliate_url || s.homepage;
    var inner = link
      ? '<a href="' + esc(link) + '" target="_blank" rel="sponsored nofollow noopener"' +
        (s.affiliate_url ? ' title="推广链接：通过此链接注册我们可能获得返佣，排名不受影响"' : '') +
        '>' + name + '</a>'
      : name;
    var extra = '';
    if (s.usd_rate && s.usd_rate > 1.05) {
      extra = '<span class="chip chip-fx" title="该站 /api/status 声明 1 美元额度 = ¥' + money(s.usd_rate) + '，本行价格已按这个汇率折算（不是 1 元 = 1 美元）">1$=¥' + money(s.usd_rate) + '</span>';
    }
    return '<div class="station"><div class="name">' + inner + '</div>' +
      '<div class="chips"><span class="chip kind-' + s.kind + '">' + esc(s.kind_label) + '</span>' + extra + '</div></div>';
  }

  function sourceCell(r) {
    var tip = r.calc_full || r.calc || r.note || '';
    var label;
    if (r.station.price_source_label) label = esc(r.station.price_source_label);
    else if (r.price_source === 'reference') label = 'OpenRouter 基准价';
    else if (r.station.kind === 'official' || r.price_source === 'official') label = '官方计费页';
    else if (r.price_source === 'auto') label = '<span class="auto">自动抓取</span>';
    else label = '人工核验';
    return '<span class="src" title="' + esc(tip) + '">' + label + '</span>';
  }

  function peakTip(r) {
    return r.peak ? '<div class="peak" title="这家模型有峰谷价，表里统一按谷价；峰价为谷价的 2 倍">峰价 ×2</div>' : '';
  }

  function renderRow(r) {
    var v = view(r);
    var d = v.disc;
    var isOff = r.station.kind === 'official';
    var calcTip = r.station.kind === 'official'
      ? '官方基准价'
      : (r.calc_full || r.calc) ||
        '站上标价 ' + money(r.nominal.input) + ' × 计费 ' + (r.billing_ratio || 1).toFixed(2) + ' = 到手价；充值优惠不算在内';
    var gTip = r.group
      ? '\n这家站公开了 ' + r.group.count + ' 个分组，倍率 ' + r.group.min + '–' + r.group.max + '×，本站按「' + r.group.name + '」组（×' + r.group.ratio + '）算'
      : '';
    var dTip = (d == null ? '—' : (d >= 0 ? '比官方便宜 ' : '比官方贵 ') + (Math.abs(d) * 100).toFixed(1) + '%') +
      '（混合成本 ' + money(v.blend) + ' vs 官方 ' + money(offBlend(r)) + '，' + W.input + '×输入 + ' + W.output + '×输出）' +
      '；' + (state.currency === 'usd'
        ? '美元口径 = 人民币实付 ÷ ' + (meta.fx ? meta.fx.usd_cny : '汇率') + '，和官方美元价同一把尺'
        : '人民币口径 = 你实际付款（充 1 元人民币 = 1 美元额度）') + gTip;

    return '<tr class="' + (r.station.demo ? 'is-demo' : '') + '">' +
      '<td>' + stationCell(r) + '</td>' +
      '<td class="num op">' + opCell(r) + '</td>' +
      '<td class="hide-sm billing">' + (r.station.billing_label ? esc(r.station.billing_label) : '<span class="muted">—</span>') + '</td>' +
      '<td><div class="model"><div class="m">' + vico(r.model.vendor) + esc(r.model.label) + '</div><div class="v">' + esc(r.model.id) + '</div></div></td>' +
      '<td class="num">' + pairCell(v.input, v.off && v.off.input, calcTip, isOff) + peakTip(r) + '</td>' +
      '<td class="num">' + pairCell(v.output, v.off && v.off.output, calcTip, isOff) + peakTip(r) + '</td>' +
      '<td class="num hide-md">' + pairCell(v.cache_read, v.off && v.off.cache_read, calcTip, isOff) + '</td>' +
      '<td class="num"><span class="disc ' + discCls(d) + '" title="' + dTip + '">' +
        (r.station.kind === 'official' ? '官方' : discText(d)) + '</span></td>' +

      '<td class="calc hide-lg">' + sourceCell(r) + '</td>' +
      '</tr>';
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var list = filtered();
    var per = state.perPage || list.length || 1;
    var pages = Math.max(1, Math.ceil(list.length / per));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * per;
    var slice = list.slice(start, start + per);

    $('#tbody').innerHTML = slice.length
      ? slice.map(renderRow).join('')
      : '<tr><td colspan="9" style="padding:36px;text-align:center" class="muted">没有匹配的记录</td></tr>';
    $('#count').textContent = list.length + ' / ' + rows.length + ' 行';
    renderPager(list.length, pages, start, slice.length);
    renderUnits();
    renderSeg();
    renderKpis();
  }

  /* ---------- 分页 ---------- */
  function pageWindow(cur, pages) {
    var out = [];
    if (pages <= 7) { for (var i = 1; i <= pages; i++) out.push(i); return out; }
    out.push(1);
    var from = Math.max(2, cur - 1);
    var to = Math.min(pages - 1, cur + 1);
    if (from > 2) out.push('…');
    for (var j = from; j <= to; j++) out.push(j);
    if (to < pages - 1) out.push('…');
    out.push(pages);
    return out;
  }

  function renderPager(total, pages, start, shown) {
    var el = $('#pager');
    if (!el) return;
    var from = total ? start + 1 : 0;
    var html = '<span class="pstat">第 ' + from + '–' + (start + shown) + ' 行 / 共 ' + total + ' 行</span>';
    html += '<select id="p-size" aria-label="每页行数">' +
      [50, 100, 200].map(function (n) {
        return '<option value="' + n + '"' + (state.perPage === n ? ' selected' : '') + '>每页 ' + n + '</option>';
      }).join('') +
      '<option value="0"' + (state.perPage === 0 ? ' selected' : '') + '>全部</option></select>';
    if (pages > 1) {
      html += '<button data-pg="' + Math.max(1, state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + '>上一页</button>';
      pageWindow(state.page, pages).forEach(function (p) {
        html += p === '…'
          ? '<button disabled>…</button>'
          : '<button data-pg="' + p + '" class="' + (p === state.page ? 'on' : '') + '">' + p + '</button>';
      });
      html += '<button data-pg="' + Math.min(pages, state.page + 1) + '"' + (state.page === pages ? ' disabled' : '') + '>下一页</button>';
    }
    el.innerHTML = html;
  }

  function renderSeg() {
    Array.prototype.forEach.call(document.querySelectorAll('#f-cur button'), function (x) {
      x.classList.toggle('on', x.dataset.cur === state.currency);
    });
  }

  function renderUnits() {
    var u = unit();
    Array.prototype.forEach.call(document.querySelectorAll('.th-u'), function (el) {
      el.textContent = el.textContent.replace(/[$¥]/, u);
    });
  }

  function fillSelect(id, values, label, current) {
    var sel = $(id);
    sel.innerHTML = '<option value="">' + esc(label) + '</option>' + values.map(function (v) {
      return '<option value="' + esc(v.value) + '">' + esc(v.text) + '</option>';
    }).join('');
    sel.value = current || '';
    if (sel.value !== (current || '')) sel.value = '';
  }

  /* ---------- 模型级联选择：左栏公司 → 右栏模型 ---------- */
  var picker = { open: false, vendor: null };

  // 消耗排行：OpenRouter 一周 token 数；没上榜的排最后，再按 models.json 里的原始顺序
  function usageRank(id) {
    var m = MODELS[id];
    return m && m.usage ? m.usage.rank : 1e9;
  }
  function usageTokens(id) {
    var m = MODELS[id];
    return m && m.usage ? m.usage.tokens : 0;
  }
  function fmtTokens(n) {
    if (!n) return '';
    if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(0) + 'B';
    return '';
  }
  function byUsage(a, b) {
    var ra = a.usage ? a.usage.rank : 1e9;
    var rb = b.usage ? b.usage.rank : 1e9;
    if (ra !== rb) return ra - rb;
    return (a.order || 0) - (b.order || 0);
  }
  // 右栏副标：一半是公司名（看全部时），一半是「N 站」收录数（有数据才显示）
  function subOf(m, withVendor) {
    var parts = [];
    if (withVendor) parts.push(vlabel(m.vendor));
    if (m.usage) parts.push('#' + m.usage.rank + (fmtTokens(m.usage.tokens) ? ' · ' + fmtTokens(m.usage.tokens) : ''));
    return parts.length ? '<span class="pk-sub">' + esc(parts.join(' · ')) + '</span>' : '';
  }

  function groupsByVendor() {
    var by = {};
    Object.keys(MODELS).forEach(function (id) {
      var v = String(MODELS[id].vendor || '其他').trim();
      (by[v] = by[v] || []).push(MODELS[id]);
    });
    var top = function (v) { return by[v].reduce(function (m, x) { return Math.min(m, usageRank(x.id)); }, 1e9); };
    var vendors = Object.keys(by).sort(function (a, b) { return top(a) - top(b) || a.localeCompare(b); });
    vendors.forEach(function (v) { by[v].sort(byUsage); });
    return { vendors: vendors, by: by };
  }

  function pickerLabel() {
    if (!state.model) return '全部模型';
    if (state.model.indexOf('vendor:') === 0) return '全部 ' + vlabel(state.model.slice(7)) + ' 模型';
    var m = MODELS[state.model];
    if (!m) return '全部模型';
    return m.label;
  }

  function initPicker() {
    var wrap = $('#f-model-wrap');
    var btn = $('#f-model');
    var pop = $('#f-model-pop');
    var vBox = $('#picker-vendors');
    var mBox = $('#picker-models');
    var G = groupsByVendor();

    vBox.innerHTML = '<button type="button" class="pk-item" data-vendor="">全部模型</button>' +
      G.vendors.map(function (v) {
        return '<button type="button" class="pk-item has-sub" data-vendor="' + esc(v) + '">' +
          '<span class="pk-name">' + vico(v) + '<span class="pk-txt">' + esc(vlabel(v)) + '</span></span><span class="pk-chev" aria-hidden="true">›</span></button>';
      }).join('');

    function paint(vendor) {
      var list = vendor
        ? G.by[vendor]
        : G.vendors.reduce(function (a, v) { return a.concat(G.by[v]); }, []).sort(byUsage);
      mBox.dataset.vendor = vendor || '';
      mBox.innerHTML = (vendor
          ? '<button type="button" class="pk-item pk-all" data-pick="vendor">全部 ' + esc(vlabel(vendor)) + ' 模型</button>'
          : '') +
        list.map(function (m) {
          return '<button type="button" class="pk-item" data-model="' + esc(m.id) + '">' +
            '<span class="pk-name">' + vico(m.vendor) + '<span class="pk-txt">' + esc(m.label) + '</span></span>' + subOf(m, !vendor) +
            '</button>';
        }).join('');
      mark();
    }

    function mark() {
      Array.prototype.forEach.call(vBox.children, function (b) {
        b.classList.toggle('on', (b.dataset.vendor || null) === (picker.vendor || null));
      });
      Array.prototype.forEach.call(mBox.children, function (b) {
        var on = b.dataset.model
          ? b.dataset.model === state.model
          : 'vendor:' + mBox.dataset.vendor === state.model;
        b.classList.toggle('on', !!on);
      });
    }

    function open() {
      if (state.model.indexOf('vendor:') === 0) picker.vendor = state.model.slice(7);
      else if (MODELS[state.model]) picker.vendor = MODELS[state.model].vendor;
      paint(picker.vendor);
      pop.hidden = false;
      place();
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      picker.open = true;
    }

    // 面板贴右边缘时往左挪，避免超出视口
    function place() {
      pop.style.left = '0px';
      var r = pop.getBoundingClientRect();
      var pad = 12;
      var shift = 0;
      if (r.right > window.innerWidth - pad) shift = (window.innerWidth - pad) - r.right;
      if (r.left + shift < pad) shift = pad - r.left;
      pop.style.left = Math.round(shift) + 'px';
    }

    function close() {
      pop.hidden = true;
      pop.style.left = '';
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      picker.open = false;
    }

    function choose(v) {
      state.model = v;
      $('#f-model-label').textContent = pickerLabel();
      if (typeof mark === 'function') mark();
      close();
      render();
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (picker.open) close(); else open();
    });

    vBox.addEventListener('mouseover', function (e) {
      var b = e.target.closest('[data-vendor]');
      if (!b) return;
      var v = b.dataset.vendor || null;
      if (v === picker.vendor) return;
      picker.vendor = v;
      paint(v);
    });

    vBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-vendor]');
      if (!b) return;
      e.stopPropagation();
      var v = b.dataset.vendor || '';
      if (!v) { choose(''); return; }
      picker.vendor = v;
      paint(v);
    });

    mBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-model],[data-pick]');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.pick === 'vendor') choose('vendor:' + mBox.dataset.vendor);
      else choose(b.dataset.model);
    });

    document.addEventListener('click', function (e) {
      if (picker.open && !e.target.closest('#f-model-wrap')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && picker.open) { close(); btn.focus(); }
    });

    $('#f-model-label').textContent = pickerLabel();
  }

  /* 表头吸顶的落点：筛选条的实际高度 */
  function syncStickTop() {
    var bar = document.querySelector('.controls');
    if (!bar) return;
    var h = Math.round(bar.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--stick-top', h + 'px');
  }


  /* ---------- 按模型查价（全站目录 catalog.json） ---------- */
  var CATALOG = null;
  var catPending = null;
  var STATION = {};
  rows.forEach(function (r) { STATION[r.station.id] = r.station; });

  function loadCatalog() {
    if (CATALOG) return Promise.resolve(CATALOG);
    if (!catPending) {
      catPending = fetch('catalog.json')
        .then(function (res) { return res.json(); })
        .then(function (j) { CATALOG = j || { models: {} }; return CATALOG; })
        .catch(function () { CATALOG = { models: {} }; return CATALOG; });
    }
    return catPending;
  }

  function blendOf(i, o) { return i * W.input + (o == null ? i : o) * W.output; }

  function renderCat(id) {
    var out = $('#cat-out');
    if (!out) return;
    if (!id) { out.innerHTML = ''; return; }
    loadCatalog().then(function (cat) {
      var m = cat.models[id];
      if (!m) {
        out.innerHTML = '<p class="cat-empty">目录里没有 <code>' + esc(id) + '</code>。可能收录它的站少于 3 家，或者名字对不上。</p>';
        return;
      }
      var b = m.b;
      var head = '<div class="cat-head"><b>' + esc(m.l) + '</b><span class="cat-meta">' + m.r.length + ' 家站在卖' +
        (b ? ' · 参照价 ' + money(b[0]) + ' / ' + money(b[1]) + '（' + (b[2] === 'official' ? '官方' : 'OpenRouter') + '）' : ' · 无参照价，只能看绝对价') +
        '</span><span class="cat-meta">单位：站上面值美元 / 百万 token</span></div>' +
        '<p class="cat-tip">同一模型在各站能差两个数量级：倍数明显大于 3 的，多半是这家站把「号池 / 统一价 / 包月池」也写进了同一张倍率表，别直接读成「贵 21 倍」。表里只做横向参考，真正下单前看「价格来源」这一列的悬停说明。</p>';
      var trs = m.r.map(function (row) {
        var sid = row[0], name = row[1], i = row[2], o = row[3], c = row[4];
        var st = STATION[sid];
        var d = b ? 1 - blendOf(i, o) / blendOf(b[0], b[1]) : null;
        var odd = d != null && d < -1;
        return '<tr><td>' + esc(st ? st.name : sid) + '</td><td class="num">' + money(i) + '</td><td class="num">' + money(o) + '</td>' +
          '<td class="num hide-md">' + (c == null ? '<span class="dash">—</span>' : money(c)) + '</td>' +
          '<td class="num">' + (d == null ? '<span class="dash">—</span>' : odd ? '<span class="disc d-flat" title="这家站对同一模型的报价远高于参照价，通常说明它的倍率表单位不同（号池 / 统一价）">' + (i / b[0]).toFixed(1) + '×</span>' : '<span class="disc ' + discCls(d) + '">' + discText(d) + '</span>') + '</td>' +
          '<td class="cat-name">' + esc(name) + '</td></tr>';
      }).join('');
      out.innerHTML = head + '<div class="tablewrap cat-wrap"><table class="cat-table"><thead><tr><th>站点</th><th class="num">输入</th><th class="num">输出</th><th class="num hide-md">缓存读</th><th class="num">对比参照价</th><th>站上模型名</th></tr></thead><tbody>' + trs + '</tbody></table></div>';
    });
  }

  function initCatalog() {
    var q = $('#cat-q');
    if (!q) return;
    q.addEventListener('focus', function () { loadCatalog(); }, { once: true });
    // 目录是异步加载的，输入时先等它到齐再匹配，避免「第一次输入没反应」
    function match(v) {
      return loadCatalog().then(function (cat) {
        var keys = Object.keys(cat.models || {});
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var l = (cat.models[k].l || '').toLowerCase();
          if (k === v || l === v || l.replace(/\s+/g, '-') === v) return k;
        }
        return '';
      });
    }
    q.addEventListener('input', function (e) {
      var v = e.target.value.trim().toLowerCase();
      if (!v) { renderCat(''); return; }
      match(v).then(function (hit) { if (e.target.value.trim().toLowerCase() === v) renderCat(hit); });
    });
    q.addEventListener('change', function (e) {
      var v = e.target.value.trim().toLowerCase();
      if (!v) return;
      match(v).then(renderCat);
    });
    var clr = $('#cat-clear');
    if (clr) clr.addEventListener('click', function () { q.value = ''; renderCat(''); q.focus(); });
  }

  function init() {
    renderKpis();

    rows.forEach(function (r) {
      if (!MODELS[r.model.id]) {
        MODELS[r.model.id] = { id: r.model.id, label: r.model.label, vendor: r.model.vendor, popularity: 0, coverage: 0, usage: null, order: 999 };
      }
    });
    initPicker();
    initCatalog();

    var kinds = {};
    rows.forEach(function (r) { kinds[r.station.kind] = r.station.kind_label; });
    fillSelect('#f-kind', Object.keys(kinds).map(function (k) {
      return { value: k, text: kinds[k] };
    }), '全部类型', state.kind);

    $('#f-q').addEventListener('input', function (e) { state.q = e.target.value; state.page = 1; render(); });
    $('#f-kind').addEventListener('change', function (e) { state.kind = e.target.value; state.page = 1; render(); });
    $('#f-sort').addEventListener('change', function (e) { state.sort = e.target.value; state.page = 1; render(); });
    // 没有演示站 / 没有推广链接时，把对应开关藏起来，省得用户点了以为出 bug
    if (!rows.some(function (r) { return r.station.demo; })) {
      var dl = $('#f-demo') && $('#f-demo').closest('label'); if (dl) dl.style.display = 'none';
    }

    $('#f-demo').addEventListener('change', function (e) { state.showDemo = e.target.checked; state.page = 1; render(); });

    $('#f-cur').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-cur]');
      if (!b || b.dataset.cur === state.currency) return;
      state.currency = b.dataset.cur;
      Array.prototype.forEach.call(document.querySelectorAll('#f-cur button'), function (x) {
        x.classList.toggle('on', x.dataset.cur === state.currency);
      });
      render();
    });

    $('#pager').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pg]');
      if (!b || b.disabled) return;
      state.page = Number(b.dataset.pg);
      render();
      var t = document.querySelector('.tablewrap');
      if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - document.querySelector('.controls').getBoundingClientRect().height - 10, behavior: 'smooth' });
    });
    $('#pager').addEventListener('change', function (e) {
      if (e.target.id !== 'p-size') return;
      state.perPage = Number(e.target.value);
      state.page = 1;
      render();
    });

    render();
    syncStickTop();
    window.addEventListener('resize', syncStickTop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
