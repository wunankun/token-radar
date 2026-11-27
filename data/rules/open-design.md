# OpenDesign（open-design.ai）

- **站点**：OpenDesign · open-design.ai（设计工具起家，现在卖 Go / Plus / Pro / Max 模型订阅）
- **结算**：**美元**。订阅按 USD 收费；额度也用美元计量。榜单折算：人民币单价 = Go 等效美元单价 × 汇率 6.6711（`config.json` 的 `fx.usd_cny`）
- **运营时间**：2026-08（Go 套餐随 GitHub release v0.20.1 于 2026-08-19 推出；站点本身更早，web.archive.org 最早快照 2024-08-31）
- **来源**：`https://open-design.ai/zh/model-credits/`（Coding Plan 的「额度扣除倍率」，2026-11-27 抓取）、`https://open-design.ai/zh/help/billing/`（套餐与额度说明）、`https://open-design.ai/zh/pricing/`（Go $10/月、月总额度 $220）
- **账户档位**：Go $10/月 · Plus / Pro / Max（更高额度）；本榜单按 **Go** 折算

## 分组倍率

没有「1 元 = 1 美元」的倍率；Go 是**月总额度 $220** + **每模型一个「额度扣除倍率」**：

| 档位 | 月费 | 月额度 | 窗口 |
|---|---|---|---|
| Go | $10 | $220 | 5 小时 $18、7 天 $55 |

Coding Plan 13 个模型的额度扣除倍率（2026-11-27）：

| 站上模型 | 本库 id | 倍率 |
|---|---|---|
| DeepSeek V4.1 Flash | deepseek-flash | 0.5× |
| DeepSeek V4.1 Flash Eco | — | 0.27× |
| MiniMax M3.1 Flash | — | 1× |
| Hy4 Preview | hy4-preview | 1× |
| DeepSeek V4 Flash | — | 1× |
| DeepSeek V4 Flash Vision Exp | — | 1× |
| DeepSeek V4 Pro | deepseek-v4-pro | 1× |
| GLM-5.3 Flash | glm-5-3-flash | 1× |
| Kimi K2.7 Code | kimi-k2-7-code | 1× |
| Claude Haiku 5.5 | claude-haiku-5-5 | 4× |
| GPT-6 Luna | gpt-6-luna | 4× |
| MiMo V2.6 Flash | — | 4× |
| MiMo V2.6 Pro | — | 4× |

> 2026-10-20–10-27 的 DeepSeek 0.25× 限时谷价已过期，现为 0.5×。

## 折算公式（榜单口径）

```text
Go 等效美元单价 = 官方公开单价 × 额度扣除倍率 × 10 ÷ 220
人民币单价      = Go 等效美元单价 × 6.6711
```

**注意**：OpenDesign 只公布「倍率」，不公布自己的模型单价；榜单按 `data/official.json` 的官方公开价代入，属假设口径。

## 计费方式

- 类型：订阅（额度内），超额需升级套餐或按量
- DeepSeek V4.1 Flash / V4 Pro 有峰时价（官方 2×），榜单按谷价录入并在价格格标「峰价 ×2」
- 长上下文：部分模型有上下文阶梯价，本榜单只按基础档折算
- 旗舰模型（GPT-6 Astra / Claude Fable / Opus 5.5 / Kimi K3 等）**不在 Go 里**，需更高档位

## 充值

- 订阅按月扣费，无充值赠送；首月 20% Off（$8 首月、次月起 $10）

## 缓存

- 缓存读按官方公开价的 cache read 代入倍率；缓存写榜单不单列

## 坑

- **倍率不是价格**：0.5× 不等于「官方价一半」，还要乘 10/220 的额度系数
- **额度用不满更贵**：$220 是按月总额度，只用了 1/4 实际单价翻 4 倍
- **官方没公布单价**：榜单的美元价是拿官方公开价假设的，OpenDesign 实际扣费可能不同
- **Go 不含旗舰模型**：GPT-6 Astra、Claude Opus 5.5、Kimi K3 等要 Plus/Pro/Max
- 未实调核验：没有真实账单对照

## 待核验

- 额度扣除倍率是否按「官方 API 价 × 倍率」扣（页面只给倍率，无扣费日志）
- 订阅额度是否真按官方价 1:1 计量
- 实付人民币汇率
- 其余 6 个模型（Flash Eco、MiniMax、MiMo 等）本库无官方基准价，待扩库后再录
