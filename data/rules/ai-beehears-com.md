# beehears（ai.beehears.com）

- **站点**：ai.beehears.com
- **结算**：人民币，1 元 = 1 美元额度（`/api/status` 的 `usd_exchange_rate` = 1）
- **来源**：`https://ai.beehears.com/api/pricing`（2026-11-26 抓取，含 `auto_groups` / `enable_groups` 全量字段）
- **账户档位**：普通用户看到的是「自动分组」，不同档位能用的分组不同

## 分组倍率

共 56 个分组，`gpt-6.2-sol` 的 `enable_groups` 里有 7 个：

| 分组 | 倍率 | 说明 |
|---|---|---|
| 🆙 GPT - Codex | 0.1 | 官渠，Plus+Pro 池，Codex |
| GPT - Codex - Pro | 0.2 | |
| Pro - 严选 | 0.3 | |
| 🆙 GPT - 订阅可用 | 1.0 | 订阅用户专属，非订阅不可用 |
| 🌏️ OpenAI Azure | 2.0 | |
| 🌏️ OpenAI 官转 | 2.8 | |
| ♻️ default | 1.0 | 占位符，「自动选择您能用的分组，按实际使用分组计费」 |

`auto_groups`（该站声称会自动命中）：GPT - Codex、GPT - Codex - Pro、Claude 混合线路 - P3、Gemini - Plus - P5、Gemini - Max1 - P6。

## 计费方式

- 类型：`tiered_expr` 表达式，`model_ratio` 不是直接单价
- 表达式原文：

```text
len <= 272000 ? tier("standard", p * 2 + c * 10 + cr * 0.1 + cc * 2.5 + cc12h * 5)
              : tier("long_context", p * 4 + c * 15 + cr * 0.2 + cc * 5 + cc12h * 10)
```

（`p`=输入、`c`=输出、`cr`=缓存读、`cc`=5 分钟缓存写、`cc12h`=1 小时缓存写；`service_tier=priority/fast` 时再 ×2）

## 充值

- 暂无公开的充值赠送规则，未核验

## 缓存

- 读：输入价的 5%（`cache_ratio` 0.05）
- 写：输入价的 1.25 倍（`create_cache_ratio` 1.25）

## 坑

- 官网模型卡片显示的价是「自动分组」的价（0.1×），不是 default 分组（1.0×）。拿 default 算会把价格高估 10 倍。
- `default` 分组名字叫默认，其实是「按实际使用分组计费」的占位符，不能当基准。

## 待核验

- 实际扣费是否真按 auto_groups 的首选分组走（需要一把 key 实调一次 `gpt-6.2-sol` 看账单）
