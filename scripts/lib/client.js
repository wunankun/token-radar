/* Token 雷达 · 前端渲染（无依赖，数据来自 window.__DATA__） */
(function () {
  'use strict';

  var DATA = window.__DATA__ || { rows: [], meta: {} };
  var rows = DATA.rows || [];
  var meta = DATA.meta || {};
  var W = meta.blend || { input: 0.7, output: 0.3 };

  var state = { q: '', model: '', kind: '', sort: 'discount', showDemo: false, onlyAff: false, currency: 'cny', page: 1, perPage: 50 };

  // 当前计价口径：美元 = 站上标的美元牌价（倍率 1.0 → 0%）；人民币 = 你实际掏的钱（1 元 = 1 美元额度）
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
    if (d < 0.005) return 'd-flat';
    if (d < 0.3) return 'd-low';
    if (d < 0.6) return 'd-mid';
    if (d < 0.8) return 'd-good';
    return 'd-best';
  }
  function discText(d) {
    if (d === null || d === undefined) return '—';
    var p = d * 100;
    if (Math.abs(p) < 0.05) return '0%';
    if (p < 0) return '贵 ' + Math.abs(p).toFixed(0) + '%';
    return (p >= 10 ? p.toFixed(0) : p.toFixed(1)) + '%';
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
  function pairCell(now, off, tip, isOfficial) {
    if (now === null || now === undefined) return '<span class="muted">—</span>';
    var html = '<span class="unit" title="' + (tip || '') + '">' + money(now) + '</span>';
    // 官方行只有一个数（它自己就是基准）；中转行一律把官方价划掉放在右边，
    // 即使两者相同也显示，否则美元口径下满屏 1.0 倍率的站会看不出比价对象。
    if (!isOfficial && off !== null && off !== undefined) {
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
        (state.currency === 'usd' ? ' · 切到人民币时用它折算官方价' : ' · 官方价已按此折人民币')
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
      var va = view(a);
      var vb = view(b);
      if (state.sort === 'discount') {
        var av = va.disc == null ? -Infinity : va.disc;
        var bv = vb.disc == null ? -Infinity : vb.disc;
        return bv - av;
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
    var v = view(r);
    var d = v.disc;
    var isOff = r.station.kind === 'official';
    var calcTip = r.station.kind === 'official'
      ? '官方基准价'
      : '站上标价 ' + money(state.currency === 'usd' ? r.nominal.input : r.nominal.input) + ' × 计费 ' + (r.billing_ratio || 1).toFixed(2) + ' ÷ 赠送 ' + (r.bonus || 1).toFixed(2) + ' = 到手价';
    var dTip = (d == null ? '—' : (d >= 0 ? '比官方便宜 ' : '比官方贵 ') + (Math.abs(d) * 100).toFixed(1) + '%') +
      '（混合成本 ' + money(v.blend) + ' vs 官方 ' + money(offBlend(r)) + '，' + W.input + '×输入 + ' + W.output + '×输出）' +
      (state.currency === 'usd' ? '；美元口径 = 站上牌的美元价，不是人民币实付' : '；人民币口径已按 1 元 = 1 美元额度折成实付');

    return '<tr class="' + (r.station.demo ? 'is-demo' : '') + '">' +
      '<td>' + stationCell(r) + '</td>' +
      '<td><div class="model"><div class="m">' + esc(r.model.label) + '</div><div class="v">' + esc(r.model.vendor) + '</div></div></td>' +
      '<td class="num">' + pairCell(v.input, v.off && v.off.input, calcTip, isOff) + '</td>' +
      '<td class="num">' + pairCell(v.output, v.off && v.off.output, calcTip, isOff) + '</td>' +
      '<td class="num hide-md">' + pairCell(v.cache_read, v.off && v.off.cache_read, calcTip, isOff) + '</td>' +
      '<td class="num"><span class="disc ' + discCls(d) + '" title="' + dTip + '">' +
        (r.station.kind === 'official' ? '官方' : discText(d)) + '</span></td>' +
      '<td class="calc hide-lg" title="' + esc(r.calc || '') + '">' + esc(r.calc_v || r.calc || '') + '</td>' +
      '<td class="hide-md">' + sourceCell(r) + '</td>' +
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
      : '<tr><td colspan="8" style="padding:36px;text-align:center" class="muted">没有匹配的记录</td></tr>';
    $('#count').textContent = list.length + ' / ' + rows.length + ' 行';
    renderPager(list.length, pages, start, slice.length);
    renderUnits();
    renderSeg();
    renderCurNote();
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

  function renderCurNote() {
    var n = $('#cur-note');
    if (n) n.hidden = state.currency !== 'cny';
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

  // 热度：优先用构建期算出来的 heat（有几家真实站在卖），没有就退回人工 popularity
  function heatOf(m) { return m.heat == null ? m.popularity || 0 : m.heat; }
  function byHeat(a, b) {
    return heatOf(b) - heatOf(a) || (b.popularity || 0) - (a.popularity || 0) || a.label.localeCompare(b.label);
  }
  // 右栏副标：一半是公司名（看全部时），一半是「N 站」收录数（有数据才显示）
  function subOf(m, withVendor) {
    var parts = [];
    if (withVendor) parts.push(m.vendor);
    if (m.coverage > 0) parts.push(m.coverage + ' 站');
    return parts.length ? '<span class="pk-sub">' + esc(parts.join(' · ')) + '</span>' : '';
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
    if (String(m.label).toLowerCase().indexOf(String(m.vendor).toLowerCase()) === 0) return m.label;
    return m.vendor + ' · ' + m.label;
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
          '<span>' + esc(v) + '</span><span class="pk-chev" aria-hidden="true">›</span></button>';
      }).join('');

    function paint(vendor) {
      var list = vendor
        ? G.by[vendor]
        : G.vendors.reduce(function (a, v) { return a.concat(G.by[v]); }, []).sort(byHeat);
      mBox.dataset.vendor = vendor || '';
      mBox.innerHTML = (vendor
          ? '<button type="button" class="pk-item pk-all" data-pick="vendor">全部 ' + esc(vendor) + ' 模型</button>'
          : '') +
        list.map(function (m) {
          return '<button type="button" class="pk-item" data-model="' + esc(m.id) + '">' +
            '<span>' + esc(m.label) + '</span>' + subOf(m, !vendor) +
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
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      picker.open = true;
    }

    function close() {
      pop.hidden = true;
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

    $('#f-q').addEventListener('input', function (e) { state.q = e.target.value; state.page = 1; render(); });
    $('#f-kind').addEventListener('change', function (e) { state.kind = e.target.value; state.page = 1; render(); });
    $('#f-sort').addEventListener('change', function (e) { state.sort = e.target.value; state.page = 1; render(); });
    $('#f-demo').addEventListener('change', function (e) { state.showDemo = e.target.checked; state.page = 1; render(); });
    $('#f-aff').addEventListener('change', function (e) { state.onlyAff = e.target.checked; state.page = 1; render(); });

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

    var demoCount = rows.filter(function (r) { return r.station.demo; }).length;
    if (demoCount) {
      var b = $('#demo-banner');
      b.hidden = false;
      var d = meta.best_demo;
      b.innerHTML = '⚠️ 库里还有 <b>' + demoCount + '</b> 条演示数据（<code>demo: true</code>），是假站点，已默认隐藏。' +
        (d ? '演示数据里最优惠为 <b>' + discText(d.discount) + '</b>（' + esc(d.station) + ' · ' + esc(d.model) + '）。' : '') +
        '勾选上面的「显示演示数据」可以看到它们，换成真实站点后这几条自动消失。';
    }
    render();
    syncStickTop();
    window.addEventListener('resize', syncStickTop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
