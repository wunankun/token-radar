# OpenCode（opencode.ai）

- **站点**：OpenCode · opencode.ai（Go 订阅制的统一网关）
- **结算**：**美元**。订阅按 USD 收费；额度也用美元计量。榜单折算：人民币单价 = Go 等效美元单价 × 汇率 6.6711（`config.json` 的 `fx.usd_cny`）
- **运营时间**：待核验，未写入 `operating_since`
- **来源**：`https://opencode.ai/docs/console/go/`（Go 订阅规则）、`https://opencode.ai/docs/console/models/`（PAYG 价目表）、`https://opencode.ai/inference/go/v1/models`（实抓 37 条，其中 31 条 chat，每条含 `cost.text.*` 与 `go.monthly_usage.go`）（2026-11-27 抓取）
- **账户档位**：Go $10/月 · Go Plus $40/月 · Go Teams $20/人/月（2 人起）；另有按量付费（PAYG）余额，订阅额度用完可回落到 PAYG

## 分组倍率

无分组倍率。Go 不是「倍率 × 官方价」，而是**每模型一个美元月额度**：

| 档位 | 月费 | 月额度 | 说明 |
|---|---|---|---|
| Go | $10 | 按模型美元计（各模型不同） | 5 小时限额 = 月额度 20%，每周限额 = 50%，月额度随付费周期重置 |
| Go Plus | $40 | 同上，额度更高 | |
| Go Teams | $20/人 | 同上 | 2 人起 |

各模型 `go.monthly_usage.go`（2026-11-27 实抓，USD）：

| 模型 | 月额度 | 站上 token 价（in / out / cache read，USD/M） |
|---|---|---|
| glm-5.3 | 200 | 1.4 / 4.4 / 0.26 |
| deepseek-v4.1-flash | 100 | 0.15 / 0.6 / 0.003 |
| deepseek-v4-pro | 15 | 0.66 / 1.98 / 0.022 |
| gpt-5.6-luna | 15 | 0.2 / 1.2 / 0.02 |
| gpt-6-luna | 15 | 0.1 / 0.5 / 0.01 |
| claude-haiku-5-5 | 15 | 0.1 / 0.5 / 0.01 |
| kimi-k3 | 15 | 3 / 15 / 0.3 |
| kimi-k3.1-pro | 60 | 2 / 10 / 0.2 |
| kimi-k2.7-code | 60 | 0.95 / 4 / 0.19 |
| qwen3.8-max | 15 | 2 / 6 / 0.25 |
| qwen3.8-flash | 30 | 0.15 / 0.47 / 0.016 |
| qwen3.7-plus | 60 | 0.4 / 1.6 / 0.04 |
| qwen4-max | 15 | 1.5 / 4.5 / 0.075 |
| glm-5.3-flash | 60 | 0.15 / 0.5 / 0.03 |
| gemini-4-argon | 30 | 2 / 10 / 0.1 |
| hy3 | 60 | 0.14 / 0.58 / 0.035 |
| hy4-preview | 30 | 0.834 / 2.501 / 0.042 |
| hy4 | 60 | 0.834 / 2.501 / 0.042 |

## 折算公式（榜单口径）

```text
Go 等效美元单价 = 站上 token 单价 × 10 ÷ 该模型的 go.monthly_usage.go
人民币单价      = Go 等效美元单价 × 6.6711
```

即「把 $10 月费用满额摊到额度上」的单价。等价说法：`glm-5.3` 额度是月费的 20 倍，等效 0.05×；`deepseek-v4.1-flash` 是 10 倍，等效 0.1×；多数模型是 1.5 倍，等效 0.667×。

## 计费方式

- 类型：订阅 + 按量（订阅额度用尽可回落 PAYG）
- 「Token prices are per 1M tokens and are the same for Go, Go Plus, and Go Teams」
- 部分模型有长上下文档位加价（`cost.text.*.overrides`），例如：

```text
gpt-6-luna  context > 272000  → input 0.2 / output 0.75 / cache read 0.02
claude-haiku-5-5  context > 100000 → input 0.5 / output 2.5 / cache read 0.05
```

- 部分模型有时间段系数（`cost.multipliers`）：DeepSeek V4.1 Flash / V4 Pro 在工作日 UTC 01–04、06–10 为 2×（与 DeepSeek 官方峰时一致），榜单按谷价录入并在价格格标「峰价 ×2」；Gemini 4 Argon 从 2026-12-01 起站上价 ×2

## 充值

- 订阅按月扣费，无充值赠送；PAYG 余额按官方 PAYG 价目表计费，不享 Go 折扣

## 缓存

- 缓存读按 `cost.text.input.cache.read` 标价，折算方式与输入价相同
- 缓存写：部分模型给出 30m / 12h 分档（如 gpt-6-luna 0.125 / 0.25），榜单不单列

## 坑

- **额度不等于无限用**：Go 的月额度是美元上限，用不满额度时实际单价高于榜单值（比如只用了额度的 50%，等效单价翻倍）
- **不是所有模型都在 Go 里**：Go 只覆盖部分开源/合作模型；Claude、GPT 全系不在此列，别把 Go 价当成站内通用价
- **免费档（beam-free / iceman-contributor-free / hy4-flash-free / hungerg-free）价格是 0**，无法用「折扣」比较，未录入榜单
- **长上下文与时段系数会让实际更贵**，本榜单只按基础档折算
- 未实调核验：没有真实账单对照

## 待核验

- 上线时间（官网只有文档，无公告日期）
- Go 月额度的重置规则细节（文档说随付费周期重置，未说明具体日）
- 免费模型是否限速 / 限并发
- 站上 31 款 chat 模型里，本库已收录 18 款；其余（grok-4.7、minimax-m3、minimax-m3.1-flash、mimo-v2.6-pro/flash、step-5-preview、longcat-2.5、muse-spark-1.2/1.3-contributor 等）本库暂无官方基准价，待扩库后再录；4 款免费模型（beam-free / iceman-contributor-free / hy4-flash-free / hungerg-free）无价可比，不录
- 实充汇率（人民币付款时）
