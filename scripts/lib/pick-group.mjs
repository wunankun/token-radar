#!/usr/bin/env node
// 一家站有很多「分组」，每个组的倍率不一样；同一个模型在不同组里的价格能差 20 倍。
// 这个模块回答一个问题：对这家站的这个模型，用户实际会按哪个组的价结算？
//
// 优先级：
//   ① 站点声明的 auto_groups（前台「自动选择」的档，用户默认落在这里）
//   ② 该模型 enable_groups 里最便宜的「非限用途」档（订阅/按次/生图/视频 这类跳过）
//   ③ 站点 default 组
// 选择结果写进行里，页面上「计算方式」一栏会标出用的是哪个组，方便人工复核。

// 这些档不是「按量付费」的现货价：订阅套餐、按次、生图/视频、测试档、需单独建 Key
const UNUSABLE = /订阅|按次|生图|视频|测试|试用|体验|临时|单独建\s*Key|image|video/i;
// 低于官方 2% 的倍率基本是包月/活动池，按量口径算不出这个钱，不当作主价
const FLOOR = 0.02;

export function pickGroup(snapshot, raw = {}) {
  const ratios = snapshot?.group_ratios || {};
  const enabled = Array.isArray(raw.enable_groups) ? raw.enable_groups : [];
  const auto = Array.isArray(snapshot?.auto_groups) ? snapshot.auto_groups : [];
  const usable = snapshot?.usable_group || {};
  const ratioOf = (n) => (Number(ratios[n]) > 0 ? Number(ratios[n]) : null);
  const open = (n) => !enabled.length || enabled.includes(n);
  const label = (n) => String(n).replace(/[^0-9A-Za-z\u4e00-\u9fa5 _\-]/g, '').trim() || n;

  const ok = (n) =>
    ratioOf(n) != null && ratioOf(n) >= FLOOR && !UNUSABLE.test(n) && !UNUSABLE.test(usable[n] || '');

  // ① 站点声明的「自动分组」里最便宜的可用档 —— 用户默认就落在这里
  const autoPick = auto.filter((n) => open(n) && ok(n)).sort((a, b) => ratioOf(a) - ratioOf(b))[0];
  if (autoPick) {
    return { name: label(autoPick), full: autoPick, ratio: ratioOf(autoPick), source: 'auto', desc: usable[autoPick] || '' };
  }

  // ② 该模型启用分组里最便宜的非限用途档
  const defName = Object.keys(ratios).find((n) => /default|默认/i.test(n));
  const enabledPick = enabled
    .filter((n) => ok(n) && n !== defName)
    .sort((a, b) => ratioOf(a) - ratioOf(b))[0];
  if (enabledPick) {
    return { name: label(enabledPick), full: enabledPick, ratio: ratioOf(enabledPick), source: 'enabled', desc: usable[enabledPick] || '' };
  }

  // ③ 默认分组
  const def = Object.keys(ratios).find((n) => /default|默认/i.test(n));
  const ratio = def ? ratioOf(def) : Number(snapshot?.group_ratio) || 1;
  return { name: def ? label(def) : 'default', full: def || 'default', ratio: ratio ?? 1, source: 'default', desc: def ? usable[def] || '' : '' };
}

export const GROUP_SOURCE_LABEL = { auto: '自动分组', enabled: '可选最省', default: '默认分组' };
