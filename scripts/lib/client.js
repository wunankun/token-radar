/* Token 雷达 · 前端渲染（无依赖，数据来自 window.__DATA__） */
(function () {
  'use strict';

  var DATA = window.__DATA__ || { rows: [], meta: {} };
  var rows = DATA.rows || [];
  var meta = DATA.meta || {};

  var FLAG_LABEL = {
    unverified: '未核验', reverse: '逆向渠道', 'cheap-trap': '低价陷阱',
    'billing-inflation': '计费虚高', 'model-substitution': '疑似掉包', 'no-entity': '无主体',
    'operator-self': '自营主体', 'ran-away': '已跑路', 'no-refund': '不退款',
    'prepaid-only': '仅预付', 'limited-models': '型号不全'
  };
  var DANGER_FLAGS = ['ran-away', 'model-substitution', 'no-entity'];

  var state = { q: '', model: '', kind: '', sort: 'ratio', showDemo: true, onlyAff: false };
  var $ = function (sel) { return document.querySelector(sel); };

  /* ---------- 格式化 ---------- */
  function money(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    if (v === 0) return '0';
    if (v < 0.01) return v.toFixed(4);
    if (v < 1) return v.toFixed(3);
    return v.toFixed(2);
  }
  function ratioCls(r) {
    if (r === null || r === undefined) return 'r-na';
    if (r > 1.05) return 'r-bad';
    if (r >= 0.95) return 'r-eq';
    if (r >= 0.5) return 'r-low';
    if (r >= 0.2) return 'r-mid';
    return 'r-hi';
  }
  function ratioText(r) {
    if (r === null || r === undefined) return '—';
    if (r >= 0.95 && r <= 1.05) return '官方价';
    var z = r * 10;
    return (z < 1 ? z.toFixed(2) : z.toFixed(1)) + ' 折';
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    return (v * 100).toFixed(v === 1 ? 0 : 1) + '%';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pair(o, cls) {
    if (!o) return '<span class="muted">—</span>';
    return '<span class="pair ' + (cls || '') + '">' + money(o.input) + ' <span class="in">/</span> <b>' + money(o.output) + '</b></span>';
  }

  /* ---------- KPI ---------- */
  function renderKpis() {
    var c = meta.counts || {};
    var best = meta.best;
    var auto = rows.filter(function (r) { return r.price_source === 'auto'; }).length;
    var aff = rows.filter(function (r) { return r.station.affiliate_url; }).length;

    var cards = [
      {
        k: '在录规模', v: String(c.stations || 0), small: '个站点',
        s: (c.models || 0) + ' 个模型 · ' + (c.rows || 0) + ' 行价格'
      },
      {
        k: '最低综合折扣', accent: true,
        v: best ? ratioText(best.ratio) : '—',
        s: best ? (esc(best.station) + ' · ' + esc(best.model)) : '录入真实中转站后自动计算'
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

  /* ---------- 筛选 ---------- */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (!state.showDemo && r.station.demo) return false;
      if (state.onlyAff && !r.station.affiliate_url) return false;
      if (state.model && r.model.id !== state.model) return false;
      if (state.kind && r.station.kind !== state.kind) return false;
      if (q) {
        var hay = (r.station.name + ' ' + r.model.label + ' ' + r.model.id + ' ' + r.station.kind_label).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      var av, bv;
      if (state.sort === 'uptime') {
        av = a.health && a.health.uptime_7d != null ? a.health.uptime_7d : -1;
        bv = b.health && b.health.uptime_7d != null ? b.health.uptime_7d : -1;
        return bv - av;
      }
      if (state.sort === 'ratio') {
        av = a.ratio.blend == null ? Infinity : a.ratio.blend;
        bv = b.ratio.blend == null ? Infinity : b.ratio.blend;
        return av - bv;
      }
      av = a.effective && a.effective[state.sort] != null ? a.effective[state.sort] : Infinity;
      bv = b.effective && b.effective[state.sort] != null ? b.effective[state.sort] : Infinity;
      return av - bv;
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

    var chips = ['<span class="chip kind-' + s.kind + '">' + esc(s.kind_label) + '</span>'];
    if (s.demo) chips.push('<span class="chip demo">演示</span>');
    (s.risk_flags || []).forEach(function (f) {
      var cls = DANGER_FLAGS.indexOf(f) !== -1 ? ' flag-danger' : ' flag-warn';
      chips.push('<span class="chip' + cls + '">' + esc(FLAG_LABEL[f] || f) + '</span>');
    });

    return '<div class="station"><div class="name">' + inner + '</div><div class="chips">' + chips.join('') + '</div></div>';
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
    var h = r.health;
    var offTip = r.official_cny
      ? '官方 ' + money(r.official_cny.input) + ' / ' + money(r.official_cny.output) + ' 元/百万'
      : '没有官方基准价';
    return '<tr class="' + (r.station.demo ? 'is-demo' : '') + '">' +
      '<td>' + stationCell(r) + '</td>' +
      '<td><div class="model"><div class="m">' + esc(r.model.label) + '</div><div class="v">' + esc(r.model.vendor) + '</div></div></td>' +
      '<td class="num">' + pair(r.nominal) + '</td>' +
      '<td class="num muted" title="充值赠送 ×' + (r.bonus || 1).toFixed(2) + '（充得多单价就更低）· 实测计费系数 ×' + (r.billing_ratio || 1).toFixed(2) + '（>1 表示 usage 报得比实际多）">×' + (r.bonus || 1).toFixed(2) + ' / ×' + (r.billing_ratio || 1).toFixed(2) + '</td>' +
      '<td class="num big">' + pair(r.effective) + '</td>' +
      '<td class="num"><span class="ratio ' + ratioCls(r.ratio.blend) + '" title="' + offTip + '">' + ratioText(r.ratio.blend) + '</span></td>' +
      '<td class="num hide-md">' + (h && h.uptime_7d != null
        ? '<span class="uptime">' + pct(h.uptime_7d) + '</span><span class="bar"><i style="width:' + Math.round(h.uptime_7d * 100) + '%"></i></span>'
        : '<span class="muted">—</span>') + '</td>' +
      '<td class="hide-md">' + sourceCell(r) + '</td>' +
      '</tr>';
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var list = filtered();
    $('#tbody').innerHTML = list.length
      ? list.map(renderRow).join('')
      : '<tr><td colspan="8" style="padding:36px;text-align:center" class="muted">没有匹配的记录</td></tr>';
    $('#count').textContent = list.length + ' / ' + rows.length + ' 行';
  }

  function fillSelect(id, values, label) {
    var sel = $(id);
    sel.innerHTML = '<option value="">' + label + '</option>' + values.map(function (v) {
      return '<option value="' + esc(v.value) + '">' + esc(v.text) + '</option>';
    }).join('');
    sel.addEventListener('change', function () {
      var key = id === '#f-model' ? 'model' : 'kind';
      state[key] = sel.value;
      render();
    });
  }

  function init() {
    renderKpis();

    var models = {};
    rows.forEach(function (r) { models[r.model.id] = r.model.label; });
    fillSelect('#f-model', Object.keys(models).sort(function (a, b) {
      return models[a].localeCompare(models[b]);
    }).map(function (id) { return { value: id, text: models[id] }; }), '全部模型');

    var kinds = {};
    rows.forEach(function (r) { kinds[r.station.kind] = r.station.kind_label; });
    fillSelect('#f-kind', Object.keys(kinds).map(function (k) {
      return { value: k, text: kinds[k] };
    }), '全部类型');

    $('#f-q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
    $('#f-sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    $('#f-demo').addEventListener('change', function (e) { state.showDemo = e.target.checked; render(); });
    $('#f-aff').addEventListener('change', function (e) { state.onlyAff = e.target.checked; render(); });

    var demoCount = rows.filter(function (r) { return r.station.demo; }).length;
    if (demoCount) {
      var b = $('#demo-banner');
      b.hidden = false;
      var d = meta.best_demo;
      b.innerHTML = '⚠️ 当前含 <b>' + demoCount + '</b> 条演示数据（<code>demo: true</code>），用于展示折算与排序效果，并非真实站点。' +
        (d ? '演示数据里最低为 <b>' + ratioText(d.ratio) + '</b>（' + esc(d.station) + ' · ' + esc(d.model) + '）。' : '') +
        '把 <code>data/providers/</code> 里的示例文件换成真实站点后自动消失。';
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
