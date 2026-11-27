# Command Code（commandcode.ai）

- **站点**：Command Code · commandcode.ai（订阅制 coding agent，同时提供模型网关）
- **结算**：**美元**。订阅按 USD 收费；额度也用美元（credits）计量。榜单折算：人民币单价 = GOAT 等效美元单价 × 汇率 6.6711（`config.json` 的 `fx.usd_cny`）
- **运营时间**：2026-08（GOAT 套餐 2026-08-04 上线，官方 blog《Introducing the GOAT plan》；更早的 $1 Go 计划具体上线日未见公开说明，站点域名 2025-10-14 已有页面）
- **来源**：`https://commandcode.ai/docs/plans/goat`（GOAT 价目表，2026-11-27 抓取，页面 76 个模型；每条含 rates 与 Monthly credits）、`https://commandcode.ai/blog/introducing-the-goat-plan`（2026-08-04 发布）
- **账户档位**：Go $1/月（月额度 $10）· GOAT $10/月（月额度最高 $100）· Pro / Max（更高额度）；本榜单按 **GOAT** 折算

## 分组倍率

无分组倍率。GOAT 不是「倍率 × 官方价」，而是**每模型一个美元月额度（Monthly credits）**：

| 档位 | 月费 | 月额度 | 说明 |
|---|---|---|---|
| Go | $1 | $10 | 5 小时窗口 $3、每周 $6 |
| GOAT | $10 | 最高 $100（按模型不同） | 「$10 buys up to $100 of credits」，即最高 10× |

各模型 Monthly credits（2026-11-27 抓取，USD）与本库已收录的 23 款：

| 站上模型 | 本库 id | 月额度 | 站上 token 价（in / out / cache read，USD/M） |
|---|---|---|---|
| DeepSeek V4.1 Flash | deepseek-flash | 100 | 0.15 / 0.6 / 0.003（峰时 0.3 / 1.2 / 0.006） |
| DeepSeek V4 Pro | deepseek-v4-pro | 20 | 0.66 / 1.98 / 0.022（峰时 1.32 / 3.96 / 0.044） |
| Claude Sonnet 5.5 | claude-sonnet-5-5 | 10 | 2 / 10 / 0.1 |
| Claude Haiku 5.5 | claude-haiku-5-5 | 20 | 0.1 / 0.5 / 0.01 |
| GPT-5.6 Sol | gpt-5.6-sol | 20 | 5 / 30 / 0.5 |
| GPT-5.6 Luna | gpt-5.6-luna | 20 | 0.2 / 1.2 / 0.02 |
| GPT-6 Luna | gpt-6-luna | 20 | 0.1 / 0.5 / 0.01 |
| GLM-5.3 | glm-5-3 | 70 | 1.4 / 4.4 / 0.26 |
| GLM-5.3 Flash | glm-5-3-flash | 100 | 0.15 / 0.5 / 0.03 |
| GLM-5.2 | glm-5-2 | 70 | 1.4 / 4.4 / 0.26 |
| GLM-5 | glm-5 | 20 | 1 / 3.2 / 0.2 |
| Kimi K3 | kimi-k3 | 20 | 3 / 15 / 0.3 |
| Kimi K3.1 Pro | kimi-k3-1-pro | 20 | 2 / 10 / 0.2 |
| Kimi K2.7 Code | kimi-k2-7-code | 60 | 0.95 / 4 / 0.19 |
| Kimi K2.6 | kimi-k2-6 | 20 | 0.95 / 4 / 0.16 |
| Kimi K2.5 | kimi-k2-5 | 20 | 0.6 / 3 / 0.1 |
| Qwen 4 Max | qwen4-max | 15 | 1.5 / 4.5 / 0.075 |
| Qwen 3.8 Max | qwen3-8-max | 20 | 2 / 6 / 0.25 |
| Qwen 3.8 Flash | qwen3-8-flash | 20 | 0.16 / 0.47 / 0.016 |
| Qwen 3.7 Plus | qwen3-7-plus | 33 | 0.4 / 1.6 / 0.08 |
| Tencent Hy3 | hy3 | 70 | 0.14 / 0.58 / 0.035 |
| Tencent Hy4 Preview | hy4-preview | 20 | 0.834 / 2.501 / 0.042 |
| Tencent Hy4 Flash | hunyuan-4-flash | 15 | 0.07 / 0.281 / 0.003 |

## 折算公式（榜单口径）

```text
GOAT 等效美元单价 = 站上 token 单价 × 10 ÷ 该模型的 Monthly credits
人民币单价        = GOAT 等效美元单价 × 6.6711
```

等价说法：额度是月费的 10 倍就是 0.1×，5 倍就是 0.2×，1.5 倍就是 0.667×。榜单按「用满额度」算。

## 计费方式

- 类型：订阅（额度内）+ 官方 PAYG / 额外 credits（超额后按量）
- 站上 token 价与官方 API 价基本一致（at cost），GOAT 的折扣来自「额度 > 月费」
- DeepSeek V4.1 Flash / V4 Pro 有峰时价（2×，面板 `timeOfDay.peak`），榜单按谷价录入并在价格格标「峰价 ×2」
- 长上下文：部分模型有上下文阶梯价，本榜单只按基础档折算

## 充值

- 订阅按月扣费，无充值赠送；额外 credits 按美元原价购买

## 缓存

- 缓存读按站上 cache read 价，折算方式与输入价相同
- 缓存写有价（如 Claude Sonnet 5.5 $2.5/M），榜单不单列

## 坑

- **额度不等于无限用**：月额度是美元上限，用不满时实际单价高于榜单值
- **不同模型额度差 10 倍**：同样 $10，DeepSeek Flash 能用 $100，Claude Sonnet 5.5 只有 $10
- **订阅额度只能用自家 CLI**：Go / GOAT / Pro 走的是 Command Code 私有网关，官方 Provider API 对订阅用户返回 403 `upgrade_required`（据第三方插件 README，2026-10 信息，未自测）
- 未实调核验：没有真实账单对照

## 待核验

- $1 Go 计划的确切上线日期（GOAT 已知 2026-08-04）
- 5 小时 / 每周窗口的具体额度（Go 为 $3 / $6，GOAT 未在页面写明）
- 订阅额度是否真的按站上标价 1:1 扣（页面写 rates 与 credits，未给扣费日志）
- 实付人民币汇率（卡支付按美元扣款，支付宝/微信未确认）
- 其余 53 个模型（grok、minimax、mimo、gemini 等）本库暂无官方基准价，待扩库后再录
