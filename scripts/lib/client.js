/* Token 雷达 · 前端渲染（无依赖，数据来自 window.__DATA__） */
(function () {
  'use strict';

  var DATA = window.__DATA__ || { rows: [], meta: {} };
  var rows = DATA.rows || [];
  var meta = DATA.meta || {};
  var W = meta.blend || { input: 0.7, output: 0.3 };

  var state = { q: '', model: '', kind: '', sort: 'discount', showDemo: true, onlyAff: false };

  // 模型目录：meta.models 已按热度降序；缺字段时回落到表格里出现过的模型
  var MODELS = {};
  (meta.models || []).forEach(function (m) {
    MODELS[m.id] = {
      id: m.id,
      label: m.label,
      vendor: m.vendor,
      popularity: m.popularity || 0,
      heat: m.heat == null ? m.popularity || 0 : m.heat,
      coverage: m.coverage || 0,
      heat_source: m.heat_source || 'manual',
    };
  });
  var $ = function (sel) { return document.querySelector(sel); };

  /* ---------- 格式化 ---------- */
  function money(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    if (v === 0) return '0';
    if (v < 0.01) return String(parseFloat(v.toFixed(4)));
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
    if (d < 0) return 'd-neg';
    if (d < 0.3) return 'd-low';
    if (d < 0.6) return 'd-mid';
    if (d < 0.8) return 'd-good';
    return 'd-best';
  }
  function discText(d) {
    if (d === null || d === undefined) return '—';
    var p = d * 100;
    if (Math.abs(p) < 0.05) return '官方';
    if (p < 0) return '贵 ' + Math.abs(p).toFixed(0) + '%';
    return (p >= 10 ? p.toFixed(0) : p.toFixed(1)) + '%';
  }

  /* 官方价的同口径混合成本（只用于排序和优惠力度，不单独占列） */
  function officialBlend(r) {
    var o = r.official_cny;
    if (!o || o.input == null || o.output == null) return null;
    return o.input * W.input + o.output * W.output;
  }

  /* 一格两组数：左边现价，右边划掉的官方价 */
  function pairCell(now, off, tip) {
    if (now === null || now === undefined) return '<span class="muted">—</span>';
    var html = '<span class="unit" title="' + (tip || '') + '">' + money(now) + '</span>';
    // 和官方价一样就只显示一个数（官方行、以及已经被官方原价卖的站）
    if (off !== null && off !== undefined && money(now) !== money(off)) {
      html += '<span class="offp" title="官方同口径">' + money(off) + '</span>';
    }
    return html;
  }

  /* ---------- KPI ---------- */
  function renderKpis() {
    var c = meta.counts || {};
    var best = meta.best || meta.best_demo;
    var bestDemoOnly = !meta.best && !!meta.best_demo;
    var auto = rows.filter(function (r) { return r.price_source === 'auto'; }).length;
    var aff = rows.filter(function (r) { return r.station.affiliate_url; }).length;

    var cards = [
      {
        k: '在录规模', v: String(c.stations || 0), small: '个站点',
        s: (c.models || 0) + ' 个模型 · ' + (c.rows || 0) + ' 行价格'
      },
      {
        k: '最高优惠力度', accent: true,
        v: best && best.discount != null ? discText(best.discount) : '—',
        s: best
          ? (bestDemoOnly ? '演示：' : '') + esc(best.station) + ' · ' + esc(best.model)
          : '录入真实中转站后自动计算'
      },
      {
        k: '汇率 USD→CNY', v: String((meta.fx && meta.fx.usd_cny) || '—'),
        s: '手工维护 · ' + esc((meta.fx && meta.fx.as_of) || '') + ' · 官方价按此折人民币'
      },
      {
        k: '推广链接', v: String(aff), small: '行',
        s: auto ? ('其中 ' + auto + ' 行为自动抓取，待人工核验') : '全部为人工核验价格'
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
      if (state.onlyAff && !r.station.affiliate_url) return false;
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
      if (state.sort === 'discount') {
        var av = a.discount === null || a.discount === undefined ? -Infinity : a.discount;
        var bv = b.discount === null || b.discount === undefined ? -Infinity : b.discount;
        return bv - av;
      }
      var an = a.effective && a.effective[state.sort] != null ? a.effective[state.sort] : Infinity;
      var bn = b.effective && b.effective[state.sort] != null ? b.effective[state.sort] : Infinity;
      return an - bn;
    });
  }

  /* ---------- 行 ---------- */
  function stationCell(r) {
    var s = r.station;
    var name = esc(s.name);
    var link = s.affiliate_url || s.homepage;
    var inner = link
      ? '<a href="' + esc(link) + '" target="_blank" rel="sponsored nofollow noopener">' + name + '</a>'
      : name;
    if (s.affiliate_url) inner += '<span class="aff-dot" title="推广链接：通过此链接注册我们可能获得返佣，排名不受影响">AD</span>';
    return '<div class="station"><div class="name">' + inner + '</div>' +
      '<div class="chips"><span class="chip kind-' + s.kind + '">' + esc(s.kind_label) + '</span></div></div>';
  }

  function sourceCell(r) {
    if (r.station.kind === 'official') return '<span class="src">官方计费页</span>';
    var label = r.price_source === 'auto'
      ? '<span class="auto">自动抓取</span>'
      : '人工核验';
    var tip = r.note ? esc(r.note) : '';
    return '<span class="src" title="' + tip + '">' + label + '</span>';
  }

  function renderRow(r) {
    var off = r.official_cny;
    var nullOff = '<span class="muted"></span>';
    var d = r.discount;
    var calcTip = r.station.kind === 'official'
      ? '官方基准价'
      : '站上标价 ' + money(r.nominal.input) + ' × 计费 ' + (r.billing_ratio || 1).toFixed(2) + ' ÷ 赠送 ' + (r.bonus || 1).toFixed(2) + ' = 到手价';
    var dTip = '比官方便宜 ' + (d == null ? '—' : (d * 100).toFixed(1) + '%') +
      '（混合成本 ' + money(r.blend_effective) + ' vs 官方 ' + money(officialBlend(r)) + '，' +
      W.input + '×输入 + ' + W.output + '×输出）';

    return '<tr class="' + (r.station.demo ? 'is-demo' : '') + '">' +
      '<td>' + stationCell(r) + '</td>' +
      '<td><div class="model"><div class="m">' + esc(r.model.label) + '</div><div class="v">' + esc(r.model.vendor) + '</div></div></td>' +
      '<td class="num">' + pairCell(r.effective.input, off && off.input, calcTip) + '</td>' +
      '<td class="num">' + pairCell(r.effective.output, off && off.output, calcTip) + '</td>' +
      '<td class="num hide-md">' + pairCell(r.effective.cache_read, off && off.cache_read, calcTip) + '</td>' +
      '<td class="num"><span class="disc ' + discCls(d) + '" title="' + dTip + '">' + discText(d) + '</span></td>' +
      '<td class="hide-md">' + sourceCell(r) + '</td>' +
      '</tr>';
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var list = filtered();
    $('#tbody').innerHTML = list.length
      ? list.map(renderRow).join('')
      : '<tr><td colspan="7" style="padding:36px;text-align:center" class="muted">没有匹配的记录</td></tr>';
    $('#count').textContent = list.length + ' / ' + rows.length + ' 行';
  }

  function fillSelect(id, values, label, current) {
    var sel = $(id);
    sel.innerHTML = '<option value="">' + esc(label) + '</option>' + values.map(function (v) {
      return '<option value="' + esc(v.value) + '">' + esc(v.text) + '</option>';
    }).join('');
    sel.value = current || '';
    if (sel.value !== (current || '')) sel.value = '';
  }

  /* ---------- 模型选择：一栏，公司分行，模型缩进 ---------- */
  // 热度：优先用构建期算出来的 heat（有几家真实站在卖），没有就退回人工 popularity
  function heatOf(m) { return m.heat == null ? m.popularity || 0 : m.heat; }
  function byHeat(a, b) {
    return heatOf(b) - heatOf(a) || (b.popularity || 0) - (a.popularity || 0) || a.label.localeCompare(b.label);
  }
  function subOf(m) {
    return m.coverage > 0 ? '<span class="pk-sub">' + m.coverage + ' 站</span>' : '';
  }

  function groupsByVendor() {
    var by = {};
    Object.keys(MODELS).forEach(function (id) {
      var v = String(MODELS[id].vendor || '其他').trim();
      (by[v] = by[v] || []).push(MODELS[id]);
    });
    var top = function (v) { return by[v].reduce(function (m, x) { return Math.max(m, heatOf(x)); }, 0); };
    var vendors = Object.keys(by).sort(function (a, b) { return top(b) - top(a) || a.localeCompare(b); });
    vendors.forEach(function (v) { by[v].sort(byHeat); });
    return { vendors: vendors, by: by };
  }

  function pickerLabel() {
    if (!state.model) return '全部模型';
    if (state.model.indexOf('vendor:') === 0) return '全部 ' + state.model.slice(7) + ' 模型';
    var m = MODELS[state.model];
    if (!m) return '全部模型';
    // 模型名里已经带公司名（DeepSeek V4 Pro）就不要重复前缀
    if (String(m.label).toLowerCase().indexOf(String(m.vendor).toLowerCase()) === 0) return m.label;
    return m.vendor + ' · ' + m.label;
  }

  function initPicker() {
    var wrap = $('#f-model-wrap');
    var btn = $('#f-model');
    var pop = $('#f-model-pop');
    var list = $('#picker-list');
    var G = groupsByVendor();
    var isOpen = false;

    var html = ['<button type="button" class="pk-item pk-all" data-pick="">全部模型</button>'];
    G.vendors.forEach(function (v) {
      var covered = G.by[v].reduce(function (n, x) { return Math.max(n, x.coverage || 0); }, 0);
      html.push(
        '<button type="button" class="pk-item pk-group" data-vendor="' + esc(v) + '">' +
          '<span>' + esc(v) + '</span>' +
          '<span class="pk-sub">' + (covered > 0 ? covered + ' 站' : G.by[v].length + ' 个') + '</span>' +
        '</button>',
      );
      G.by[v].forEach(function (m) {
        html.push(
          '<button type="button" class="pk-item pk-leaf" data-model="' + esc(m.id) + '">' +
            '<span>' + esc(m.label) + '</span>' + subOf(m) +
          '</button>',
        );
      });
    });
    list.innerHTML = html.join('');

    function mark() {
      Array.prototype.forEach.call(list.children, function (b) {
        var on = b.dataset.pick === '' ? !state.model
          : b.dataset.vendor ? state.model === 'vendor:' + b.dataset.vendor
          : b.dataset.model === state.model;
        b.classList.toggle('on', !!on);
      });
    }

    function open() {
      mark();
      pop.hidden = false;
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      isOpen = true;
      var on = list.querySelector('.on');
      if (on) list.scrollTop = Math.max(0, on.offsetTop - 88);
    }

    function close() {
      pop.hidden = true;
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      isOpen = false;
    }

    function choose(v) {
      state.model = v;
      $('#f-model-label').textContent = pickerLabel();
      mark();
      close();
      render();
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen) close(); else open();
    });

    list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick],[data-vendor],[data-model]');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.vendor) choose('vendor:' + b.dataset.vendor);
      else if (b.dataset.model) choose(b.dataset.model);
      else choose('');
    });

    document.addEventListener('click', function (e) {
      if (isOpen && !e.target.closest('#f-model-wrap')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) { close(); btn.focus(); }
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

  function init() {
    renderKpis();

    rows.forEach(function (r) {
      if (!MODELS[r.model.id]) {
        MODELS[r.model.id] = { id: r.model.id, label: r.model.label, vendor: r.model.vendor, popularity: 0, heat: 0, coverage: 0, heat_source: 'manual' };
      }
    });
    initPicker();

    var kinds = {};
    rows.forEach(function (r) { kinds[r.station.kind] = r.station.kind_label; });
    fillSelect('#f-kind', Object.keys(kinds).map(function (k) {
      return { value: k, text: kinds[k] };
    }), '全部类型', state.kind);

    $('#f-q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
    $('#f-kind').addEventListener('change', function (e) { state.kind = e.target.value; render(); });
    $('#f-sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    $('#f-demo').addEventListener('change', function (e) { state.showDemo = e.target.checked; render(); });
    $('#f-aff').addEventListener('change', function (e) { state.onlyAff = e.target.checked; render(); });

    var demoCount = rows.filter(function (r) { return r.station.demo; }).length;
    if (demoCount) {
      var b = $('#demo-banner');
      b.hidden = false;
      var d = meta.best_demo;
      b.innerHTML = '⚠️ 当前含 <b>' + demoCount + '</b> 条演示数据（<code>demo: true</code>），用于展示折算与排序效果，并非真实站点。' +
        (d ? '演示数据里最优惠为 <b>' + discText(d.discount) + '</b>（' + esc(d.station) + ' · ' + esc(d.model) + '）。' : '') +
        '把 <code>data/providers/</code> 里的示例文件换成真实站点后自动消失。';
    }
    render();
    syncStickTop();
    window.addEventListener('resize', syncStickTop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
