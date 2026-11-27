/**
 * 核心折算逻辑：把「标价 + 充值赠送 + 计费虚高」还原成人民币/百万 token 的真实到手价，
 * 再和官方人民币价（美元价 × 汇率）对齐成倍率。
 *
 * 单位约定：所有 money 字段都是 CNY / 1M tokens；official.usd 是 USD / 1M tokens。
 */

export const KINDS = ['official', 'official-relay', 'reverse', 'mixed', 'aggregator', 'relay'];

export const KIND_LABEL = {
  official: '官方直购',
  'official-relay': '官转',
  reverse: '逆向',
  mixed: '混合',
  aggregator: '聚合商',
  relay: '中转·未分类',
};

export const FLAGS = [
  'unverified',
  'reverse',
  'cheap-trap',
  'billing-inflation',
  'model-substitution',
  'no-entity',
  'operator-self',
  'ran-away',
  'no-refund',
  'prepaid-only',
  'limited-models',
];

export const FLAG_LABEL = {
  unverified: '未核验',
  reverse: '逆向渠道',
  'cheap-trap': '低价陷阱',
  'billing-inflation': '计费虚高',
  'model-substitution': '疑似掉包',
  'no-entity': '无主体',
  'operator-self': '自营主体',
  'ran-away': '已跑路',
  'no-refund': '不退款',
  'prepaid-only': '仅预付',
  'limited-models': '型号不全',
};

const r4 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000);
const fmt = (n) => (n == null || !Number.isFinite(n) ? '—' : String(Number(n.toFixed(4))));
const usd = (n) => '$' + fmt(n);
const cny = (n) => '¥' + fmt(n);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const div = (a, b) => (a == null || !b ? null : a / b);

/** official.json -> Map<canonicalModelId, {provider, usd, ...}> */
export function buildOfficialIndex(official) {
  const index = new Map();
  const errors = [];
  for (const p of official.providers || []) {
    for (const [modelId, price] of Object.entries(p.models || {})) {
      if (index.has(modelId)) errors.push(`official.json: 模型 ${modelId} 在多个厂商下重复定义`);
      index.set(modelId, {
        provider: p.id,
        provider_name: p.name,
        pricing_url: p.pricing_url,
        verified_at: p.verified_at ?? null,
        usd: {
          input: num(price.input),
          output: num(price.output),
          cache_read: num(price.cache_read),
          cache_write: num(price.cache_write),
        },
        offpeak: price.offpeak || null,
        note: price.note || null,
        source: price.source || 'official',
      });
    }
  }
  return { index, errors };
}

/** 充值赠送折算成「每 1 元买到多少额度」。充 100 得 120 => 1.2 */
export function rechargeBonus(recharge) {
  if (!recharge) return 1;
  const pay = num(recharge.pay);
  const get = num(recharge.get);
  if (!pay || !get || pay <= 0) return 1;
  return get / pay;
}

function scaleObj(o, k) {
  const out = {};
  for (const key of ['input', 'output', 'cache_read']) out[key] = o[key] == null ? null : o[key] * k;
  return out;
}

/**
 * 单条 (站点 × 模型) 折算。
 * @returns {{error?: string, row?: object}}
 */
export function normalizeEntry({ station, modelId, model, stationModel, official, fx, blend, health, priceSource, faceValue = false }) {
  const officialCny = official
    ? scaleObj({ input: official.usd.input, output: official.usd.output, cache_read: official.usd.cache_read }, fx)
    : null;

  let nominal;
  let mode = stationModel?.mode;

  if (station.kind === 'official' || priceSource === 'official' || priceSource === 'reference') {
    mode = 'official';
    if (!officialCny) return { error: `${modelId}: 官方价缺失，无法生成官方法人行` };
    nominal = { ...officialCny };
  } else if (mode === 'absolute') {
    nominal = {
      input: num(stationModel.input),
      output: num(stationModel.output),
      cache_read: num(stationModel.cache_read),
    };
    if (nominal.input == null || nominal.output == null) {
      return { error: `${station.id}/${modelId}: absolute 模式必须给出 input 与 output` };
    }
  } else if (mode === 'multiplier') {
    if (!official) return { error: `${station.id}/${modelId}: 倍率模式需要官方基准价，但该模型没有官方价` };
    const value = num(stationModel.value);
    if (value == null || value <= 0) return { error: `${station.id}/${modelId}: multiplier.value 必须是正数` };
    const base = stationModel.base || 'usd_official';
    if (!['usd_official', 'cny_official'].includes(base)) {
      return { error: `${station.id}/${modelId}: multiplier.base 只能是 usd_official / cny_official` };
    }
    // usd_official：倍率乘的是官方美元价，但以人民币结算（行业「1 元 = 1 美元」惯例）
    // cny_official：倍率乘的是官方人民币价（官转常见口径）
    const factor = base === 'usd_official' ? value : value * fx;
    nominal = scaleObj(official.usd, factor);
  } else {
    return { error: `${station.id}/${modelId}: 未知的定价模式 ${mode}` };
  }

  // 站内汇率：这家站自己声明「1 美元额度值多少人民币」（/api/status 的 usd_exchange_rate）。
  // 只有「按美元额度计价」的行才乘它：倍率乘的是官方美元价、或自动抓来的 model_ratio。
  // 声明为 1 的站 = 1 元买 1 美元额度（国内常见）；声明 7.3 的站 = 1 美元额度真要 ¥7.3。
  const moneyPerUsd = num(station.usd_rate) > 0 ? num(station.usd_rate) : 1;
  const usdPriced = mode === 'multiplier' ? (stationModel?.base || 'usd_official') === 'usd_official' : !!stationModel?.observed;
  const bonus = rechargeBonus(station.recharge);
  const manualBilling = num(station.billing?.ratio);
  const probedBilling = num(health?.usage_ratio);
  const billing = manualBilling ?? probedBilling ?? 1;
  const billingSource = manualBilling != null ? 'manual' : probedBilling != null ? 'probe' : 'default';
  // 实际到手价 = 标价 × 计费虚高系数（充值赠送不计入价格，单独成列）
  const effective = scaleObj(nominal, billing * (usdPriced ? moneyPerUsd : 1));

  const ratio = {
    input: officialCny ? div(effective.input, officialCny.input) : null,
    output: officialCny ? div(effective.output, officialCny.output) : null,
    blend: null,
  };
  const w = { input: blend?.input ?? 0.7, output: blend?.output ?? 0.3 };
  const effBlend = effective.input == null || effective.output == null ? null : effective.input * w.input + effective.output * w.output;
  const offBlend = officialCny && officialCny.input != null ? officialCny.input * w.input + officialCny.output * w.output : null;
  ratio.blend = div(effBlend, offBlend);

  // 美元口径：同一笔「人民币实付」按汇率折成美元 —— 两个口径是同一笔钱的不同单位，
  // 不是「站上标的美元牌价 vs 你付的人民币」。所以切换币种时每个数字都会变，优惠力度不变。
  const usdEffective = scaleObj(effective, 1 / fx);
  const usdBlend = effBlend == null ? null : effBlend / fx;
  const usdOffBlend = official && official.usd.input != null ? official.usd.input * w.input + official.usd.output * w.output : null;

  // 「怎么算的」：把这一行的推导写成人话，表格里单独一栏
  let basis;
  const base = stationModel?.base || 'usd_official';
  const value = num(stationModel?.value);
  const fxNote = usdPriced && moneyPerUsd !== 1 ? ` × 站内汇率 ${fmt(moneyPerUsd)}（该站 1 美元额度 = ¥${fmt(moneyPerUsd)}）` : '';
  const srcName = priceSource === 'reference' ? 'OpenRouter' : '官方';
  if (mode === 'official') {
    basis = `${srcName} ${usd(official?.usd.input)}/M × 汇率 ${fmt(fx)} = ${cny(officialCny?.input)}/M`;
  } else if (mode === 'multiplier' && base === 'usd_official') {
    basis = `${srcName} ${usd(official?.usd.input)} × ${fmt(value)}${fxNote || '（1 元买 1 美元额度）'} = ${cny(effective.input)}/M`;
  } else if (mode === 'multiplier') {
    basis = `${srcName}人民币 ${cny(officialCny?.input)} × ${fmt(value)} = ${cny(nominal.input)}/M`;
  } else if (stationModel?.observed && stationModel?.group && official?.usd?.input) {
    // 自动抓的行：model_ratio 是站上的基准倍率，group.ratio 是「用户会落到的那一档」
    const g = stationModel.group;
    const mult = r4(nominal.input / official.usd.input);
    basis =
      `官方 ${usd(official.usd.input)} × 倍率 ${fmt(mult)}（${g.name}·${g.source_label || '分组'}）${fxNote}` +
      ` = ${cny(effective.input)}/M`;
  } else if (num(stationModel?.multiple) != null && official) {
    const g = stationModel.group;
    basis =
      `官方 ${usd(official.usd.input)} × 倍率 ${fmt(stationModel.multiple)}` +
      (g && g.name ? `（${g.name} 组）` : '') + fxNote +
      ` = ${cny(effective.input)}/M`;
  } else {
    basis = `站上标价 ${cny(nominal.input)}/M`;
  }
  const adj = [];
  if (billing !== 1) adj.push(`× 计费 ${fmt(billing)}`);
  const tiers = stationModel?.tiers || null;
  const tierNote = tiers
    ? `${tiers.count} 个分组档位 ${fmt(tiers.min)}–${fmt(tiers.max)}×` +
      (tiers.min_name ? `，最低「${tiers.min_name}」` : '')
    : '';
  const g = stationModel?.group;
  const groupNote = g && g.desc ? `（${g.source_label}：${g.desc}）` : '';
  const rateNote = usdPriced && moneyPerUsd === 1 ? '（该站未声明汇率，按 1 元 = 1 美元额度的常见惯例算）' : '';
  const calc = basis + (adj.length ? ` · ${adj.join(' ')}` : '') + (tierNote ? `；${tierNote}` : '') + rateNote;
  const calc_full = calc + groupNote;

  return {
    row: {
      station: {
        id: station.id,
        name: station.name,
        kind: station.kind,
        kind_label: KIND_LABEL[station.kind] || station.kind,
        demo: !!station.demo,
        homepage: station.homepage ?? null,
        affiliate_url: station.affiliate?.url ?? null,
        affiliate_code: station.affiliate?.code ?? null,
        commission: station.affiliate?.commission ?? null,
        usd_rate: Number(station.usd_rate) > 0 ? Number(station.usd_rate) : null,
        top_up: station.top_up ?? null,
        risk_flags: station.risk_flags || [],
        first_seen: station.first_seen ?? null,
        operating_since: station.operating_since ?? null,
        note: station.note ?? null,
      },
      model: { id: modelId, label: model.label, vendor: model.vendor, context: model.context ?? null },
      mode,
      price_source: priceSource || (station.kind === 'official' ? 'official' : null),
      bonus: r4(bonus),
      billing_ratio: r4(billing),
      billing_source: billingSource,
      nominal: { input: r4(nominal.input), output: r4(nominal.output), cache_read: r4(nominal.cache_read) },
      effective: { input: r4(effective.input), output: r4(effective.output), cache_read: r4(effective.cache_read) },
      official_cny: officialCny ? { input: r4(officialCny.input), output: r4(officialCny.output), cache_read: r4(officialCny.cache_read) } : null,
      official_usd: official ? { ...official.usd } : null,
      ratio: { input: r4(ratio.input), output: r4(ratio.output), blend: r4(ratio.blend) },
      // 优惠力度：比官方便宜多少（0.854 = 便宜 85.4%），负数表示比官方还贵
      discount: ratio.blend == null ? null : r4(1 - ratio.blend),
      blend_effective: r4(effBlend),
      usd: {
        effective: { input: r4(usdEffective.input), output: r4(usdEffective.output), cache_read: r4(usdEffective.cache_read) },
        official: official ? { input: r4(official.usd.input), output: r4(official.usd.output), cache_read: r4(official.usd.cache_read) } : null,
        blend: r4(usdBlend),
        discount: r4(1 - ratio.blend),
      },
      calc,
      calc_full,
      calc_basis: basis,
      group: stationModel?.group ?? null,
      observed: !!stationModel?.observed,
      tiers: tiers || null,
      recharge: station.recharge || null,
      calc_adjust: adj.join(' '),
      health: health || null,
      note: stationModel?.note ?? null,
      pricing_url: official?.pricing_url ?? station.pricing_url ?? station.homepage ?? null,
    },
  };
}
