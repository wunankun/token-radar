# Token 雷达 · AI 中转站 × 官方 价格排行

把 AI API 中转站的「倍率」「充值赠送」「计费虚高」折算成**人民币 / 百万 token 的真实到手价**，再和官方直购价对齐比较。GitHub Actions 定时抓取 + 探活，静态站一键部署到 Pages。

**在线站：<https://wunankun.github.io/token-radar/>** ｜ 仓库：<https://github.com/wunankun/token-radar>

![预览](docs/preview.png)

---

## 为什么需要一个「折算过」的榜单

打开任何一个中转站，你看到的价格有三种完全不同的口径：

| 站上写的 | 实际含义 | 真实成本 |
| --- | --- | --- |
| `0.5 倍率` | 官方**美元价** × 0.5，但以**人民币**结算（行业「1 元 = 1 美元」惯例） | ≈ 官方人民币价的 7%（便宜 14 倍） |
| `官转 6.2 折` | 官方**人民币**价 × 0.62 | 官方人民币价的 62% |
| `充 100 得 120` | 单价再打 0.83 折，但榜单通常只抄标价 | 标价 × 0.83 |

再叠加**计费虚高**（同样的 prompt，站上报出的 usage 是官方的 1.3 倍以上），一张「按标价排序」的榜单，排名和真实成本基本无关。

这个项目只做一件事：**把上面三层全部算进去，然后按真实到手价排序。**

```
实际到手价 = 标价 × 计费系数                # 充值赠送不计入价格，单独一列「充值」
混合成本   = 0.7 × 输入价 + 0.3 × 输出价        # config.json 可改，表里的「现价」
优惠力度   = 1 − 现价 ÷ 官方价                  # 百分比越大越优惠，负数表示比官方贵
充值      ≠ 价格                             # 充 100 得 120 只是少掏钱，不改单价
```

榜单按「优惠力度」从大到小排，官方直购作为基准行（优惠力度显示「官方」）。

### 两种计价口径（页面右上角切换）

同一行数据，两个问题，两个答案：

| 口径 | 表头 | 这一列显示的是 | 倍率 1.0 的站 |
|---|---|---|---|
| **美元**（默认） | `$/百万` | 同一笔实付折成美元（`¥ ÷ 6.6609`） | 0.045 vs 官方 0.3 |
| 人民币 | `¥/百万` | 你实际掏的人民币 | 0.3 vs 官方 2 |

原因是行业惯例「1 元 = 1 美元额度」：站上按 $2/M 扣额度，你付 ¥2；而官方直购 $2 要 ¥14.2，所以真金白银便宜 86%。
两个口径是**同一笔钱的不同单位**，不是两套算法：

- 人民币口径 = 你实际付款（充 1 元人民币 = 1 美元额度，所以 `$0.3/M` 的站实付 `¥0.3/M`）
- 美元口径 = 这笔实付按汇率折回美元，和官方美元价用同一把尺

所以切换币种时**每个数字都会变**（× 或 ÷ 6.6609），但「优惠力度」不变——同一笔钱不会因为换单位就更便宜。早期版本把美元口径做成了「站上标的美元牌价」，导致切到美元后站价不动、看起来像坏了，已改成折算。

### 「计算方式」那一栏

每一行都写了这条价的完整推导，可以直接核对，例如：

| 行 | 怎么算的 |
|---|---|
| 官方直购 | `官方 $0.3/M × 汇率 6.6609 = ¥2/M` |
| 中转（倍率乘美元价） | `倍率 ×0.5 × 官方 $0.3 = ¥0.15/M` |
| 官转（倍率乘人民币价） | `官方人民币 ¥2/M × 0.62 = ¥1.24/M` |
| 绝对价 | `站上标价 ¥1.5/M` |
| 有分组档位 | 追加 `；56 个分组档位 0.05–8×，最低「Claude Kiro 无缓」` |
| 有计费虚高 | 追加 `· × 计费 1.2` |

官方直购行、以及已经被官方原价卖的中转行，右边那个划掉的数也会照常显示（不再因为「两个数一样」就省略）。

### 分页

默认每页 50 行（可切 100 / 200 / 全部），页码在表格底部；改筛选条件会回到第 1 页。

倍率的口径在数据里用 `base` 字段区分，混用会算出完全错误的排名：

- `base: "usd_official"` —— 倍率乘官方美元价，以人民币结算（逆向/低价站常见）
- `base: "cny_official"` —— 倍率乘官方人民币价（官转常见）

---

## 快速开始

零依赖，只要 Node ≥ 18。

```bash
git clone https://github.com/wunankun/token-radar && cd token-radar
node scripts/build.mjs          # 生成 dist/index.html + dist/prices.json
open dist/index.html            # 直接看

node --test tests/              # 抓取链路单测（本地假站点，不联网）
node scripts/demo-crawl.mjs     # 看抓取+比价整条链路跑一遍
```

构建时会做硬校验（不通过直接失败）：

- 模型 id 必须在 `data/models.json` 登记
- 有推广链接（`affiliate.url`）就必须写 `"disclosure": true`
- 倍率模式必须有官方基准价，否则无法折算
- 每个站点的价格要能回溯到 `pricing_url`

### 模型目录与消耗排行

`data/models.json` 里每个模型有 `label` / `vendor` / `aliases` / `official`，排序不再用人工热度，**统一按外部权威用量榜**：

- 数据源：`data/rankings.json`，抓自 **OpenRouter 的 LLM Rankings**（`https://openrouter.ai/rankings`，一周内实际处理的 token 数）。OpenRouter 是目前公开可查的最大第三方推理路由，用量榜是真实 token 消耗，不是投票。
- 刷新：`npm run fetch:rankings`（`node scripts/fetch-rankings.mjs --write`），`npm run weekly` 里也会自动跑。
- 匹配：把 OpenRouter 的 `vendor/model-date` 归一化（去厂商前缀、去日期后缀），再和 `models.json` 的 id / `official.model` / `aliases` 对上。
- 排序：模型筛选里，公司按自家最好的名次排，模型按名次升序排；没上榜的排在后面，按 `models.json` 里的顺序。名字后面会显示 `#8 · 4.4T` 这样的「名次 · 当周 token 数」。
- 表格里「优惠力度」相同时，也按这个名次兜底排。

> 榜单只覆盖 OpenRouter 上的头部模型（本周 20 个），本库 35 个模型里命中 9 个；没命中的不代表不常用，只是不在这份榜上。

--- | --- | --- |
| 库里有真实站点（`demo` 不为 `true`、且不是官方直购行） | `coverage`：有几家中转站在卖这个模型，归一化成 0–100（卖得最多的那个是 100） | `coverage` |
| 只有演示数据 / 一个真实站都没有 | 回落到 `popularity` 人工值 | `manual` |

- 页面上的模型筛选是**一栏分组**：公司占一行（点它 = 整家筛），模型缩进排在下面；公司按自家最热的模型排先后，模型按热度排；
- 右栏每个模型后面会显示「N 站」——这就是它被几家收录，也是热度的原始数据。同一模型被越多站收录，热度越高；
- 官方直购行和 `demo: true` 的演示站**不计入** coverage，否则基准行会把每个模型都抬高一次；
- 缺 `popularity` 只产生 warning（先验排最后），超出 0–100 直接构建失败。
- 想让某个模型在**还没有真实数据时**排前面，就临时改 `popularity`；接上真实站点后它会被 `coverage` 自动顶掉，不需要手工维护。

---

## 数据从哪来

| 来源 | 做法 | 标记 |
| --- | --- | --- |
| 官方价 | 人工读厂商计费页，记录 `verified_at` 与来源链接（`data/official.json`） | 官方计费页 |
| 中转站价（人工） | 编辑 `data/providers/<id>.json` | 人工核验 |
| 中转站价（自动） | `fetch-pricing.mjs` 拉 new-api / one-api 的公开 `GET /api/pricing` | 自动抓取（未核验） |
| 汇率 | `fetch-fx.mjs` 每日抓 USD→CNY，写回 `config.json` 的 `fx` | 卡片上标来源与日期 |
| 可用率 | 有 key 的站点探活，只统计最近 7 天（`data/health/`） | 后台记录，不占榜单列 |

自动抓取当前**手动触发**（`node scripts/fetch-pricing.mjs --write`），定时任务还没开，原因见下面「抓取」一节。

自动抓取只写 `data/observed/`，**人工确认后才进 `data/providers/`**。因为 `/api/pricing` 返回的是「站内面值」，只有确认了这站是「1 元 = 1 美元」还是按汇率收人民币，才能正确换算成人民币价。

汇率是自动抓的，三个源依次 fallback（都失败就保留旧值，不会把 7.1 这种手填数写回页面）：

```bash
node scripts/fetch-fx.mjs          # 写回 config.json
node scripts/fetch-fx.mjs --dry    # 只看不写
```

源：`fawazahmed0/currency-api`（jsDelivr，带日期）→ `open.er-api.com` → `frankfurter.app`。

### 切换到人民币之后，站价为什么没变

这不是 bug，是中转站的计价方式决定的：站上「1 元 = 1 美元额度」，所以它标 `$0.15/百万`，你实际付的就是 `¥0.15/百万`——**数字一样，单位不一样**。

变的是两件事：

- **官方价**：`$0.3` 按汇率折成 `¥2.0`（7.1 时代是 ¥2.13）
- **优惠力度**：同一行从 50% 变成 92%

也就是说，美元口径回答「它相对官方美元价打了几折」，人民币口径回答「你钱包里少掏多少钱」。页面上切到人民币时会显示一行提示说明这件事。

官方价里还有几个现实变量，先按标准档记录，明细都在 `data/official.json` 的 `note` 里：

- DeepSeek 有峰谷价（谷时 5 折）
- Anthropic 有 5 分钟 / 1 小时缓存写入价、100K 以上长上下文加价
- OpenAI 有 Batch / 长上下文档

---

## 覆盖的厂商与模型

| 厂商 | 模型 | 价格基准 |
| --- | --- | --- |
| DeepSeek | V4 Pro、Flash、V3.2 | 官方计费页（V3.2 为参照价） |
| Anthropic | Sonnet 5.5 / 5、Opus 5.5 / 5 / 4.8、Haiku 5.5、Sonnet 4.6、Fable 5.2 | 官方计费页（部分为参照价） |
| OpenAI | GPT-6.2 Sol / Astra、GPT-6 / 6.1 / 5.6 系列、GPT-6 Luna | 官方计费页（部分为参照价） |
| Moonshot Kimi | K3.1 Pro、K3、K2.7 Code、K2.6、K2.5 | 参照价 · OpenRouter |
| 阿里云百炼 Qwen | Qwen4 Max、Qwen3.8 Max / Flash、Qwen3.7 Plus、Qwen3 Coder Next | 参照价 · OpenRouter |
| 智谱 GLM | GLM-5.3 / 5.3 Flash / 5.2 / 5 / 4.7 | 参照价 · OpenRouter |

所有基准价**统一取 OpenRouter 挂牌价**（表格「价格来源」显示「OpenRouter 基准价」），这样中转站和基准是同一把尺。每条对应的 OpenRouter id 写在 `data/official.json` 的 `openrouter_id` 里，可逐条复核。

## 抓取

中转站大多跑 new-api / one-api，它们暴露一个公开接口 `GET /api/pricing`，返回每个模型的 `model_ratio`。按 one-api 的计费口径（1 USD = 500,000 quota），**USD / 百万 token = model_ratio × 2 × group_ratio**，拿到的正好是站点自己的「倍率价」。

```bash
# 1. 加站：自动发现定价接口、抓一次、写回 data/sources.json
node scripts/fetch-pricing.mjs --add https://某个中转站.com

# 2. 手动维护后的日常抓取
node scripts/fetch-pricing.mjs            # 试跑，只打印
node scripts/fetch-pricing.mjs --write    # 落盘
```

产物：

| 文件 | 内容 |
| --- | --- |
| `data/sources.json` | 待抓站点清单。`enabled: false` 停抓；配 `status` / `note` / `disabled_at` 会在页面底部写明「已停用 X 家：域名（原因）」，停用站既不抓也不上榜 |
| `data/observed/<id>.json` | 最新一次快照：模型价、`group_ratio`、HTTP 状态、耗时、未匹配的模型名 |
| `data/price-history/<id>.jsonl` | 每次抓取追加一行，用来算涨跌和历史曲线 |
| `data/observed/index.json` | 全部站点最近一次抓取的总览 |

常用参数：

```bash
--only <id>            只抓一个站点
--concurrency 4        并发数（默认 4，别对同一家站压太高）
--timeout 15000        单次请求超时（毫秒）
--retries 2            失败重试次数（只对超时/429/5xx 重试，403 直接放弃）
--fixture <file>       用本地 JSON 跑，不联网
--list                 看看清单里有哪些站
```

会打印出涨跌，方便你一眼看出「哪家悄悄涨价了」：

```
✓ my-station   HTTP 200   312ms  模型 5/6
   ↑ 涨价 gpt-6.2-sol.input 0.9 → 1.08 (+20%)
   新增模型：gpt-6.2-astra
```

### 实测覆盖率（2026-11-26，150 个在营站）

拿 150 个真实在营的中转站域名逐个探 `GET /api/pricing`：

| 结果 | 数量 | 占比 |
| --- | --- | --- |
| 返回模型倍率，可直接解析 | 66 | 44% |
| 接口不存在（404） | 42 | 28% |
| 返回 HTML / 非 JSON（多为 Cloudflare 拦截页） | 55 | 37% |
| 超时或连不上 | 14 | 9% |
| 需要登录（401/403） | 0 | 0% |

抓取成功的 66 个站已经写进 `data/sources.json`，快照在 `data/observed/`。但**抓得到 ≠ 算得对**。

价格单位其实早就统一了：所有数都按 `model_ratio × 2 × group_ratio` 换算成 **USD / 百万 token**。麻烦在于每个站的倍率表不是同一把尺子。`node scripts/explain-observed.mjs --write` 会把 66 份快照逐个体检，判定依据写回每份快照的 `derivation` 字段，并生成 [`data/observed/REPORT.md`](data/observed/REPORT.md)（这就是「这个价怎么算出来的」备注）：

| 类别 | 判据 | 能怎么用 | 数量 |
| --- | --- | --- | --- |
| 同口径 | 站内多数模型都是官方 × 1.00（偏差 <4%） | 价格可直接比 | 26 |
| 整体倍数 | 站内多数模型乘同一个系数 | 按 × k 计，可直接比 | 3 |
| 统一价 | 所有模型同价（只收一个价，与型号无关） | 只能记统一单价，不能逐模型比 | 9 |
| 口径不一致 | 站内倍率从 1× 散到几十倍，没有多数派 | 不能当单价用（按次/表达式计费或型号串了） | 28 |

那 28 个「不能转」的站，不是没换算，而是**同一站里 claude 是 1× 而 gpt 是 37.5×**，任何统一系数（×7.1、×2、×5）都没法让它们同时成立 —— 换个单位也救不回来，只能人工在站上核一次真实扣费。
- 更要紧的是**折扣藏在分组里**：多数站的 `model_ratio` 表和官方价 1:1 一致，真正的便宜来自 `group_ratio < 1` 的分组。而分组名各站自定义（`Claude Code Kiro`、`gpt-k12`、`国模0.03`…），很多还是限定用途的组，取最小值会得到假便宜。
- 所以自动抓取只产出「观测值」，**人工确认分组倍率后**才进 `data/providers/`。确认方式很简单：在 `data/sources.json` 里给这个站写 `"group_ratio": 0.5`，下次抓取就按这一组折算；`data/observed/<id>.json` 里的 `group_ratios` 字段列出了该站全部分组倍率，供你挑选。

### OpenRouter 对照

`node scripts/fetch-openrouter.mjs --write` 会抓 OpenRouter 的公开价目表写进 `data/observed/openrouter.json`。它覆盖 Claude / GPT / DeepSeek 的主流型号，可以用来交叉验证官方价有没有改过——但它是个聚合商，价格不等于官方直购价，**不要**当成官方基准。

**几个现实情况，先说清楚：**

- **不少站抓不到。** 实测中最常见的是 Cloudflare 人机验证（403）、接口被关（404）、或者压根不是 new-api。脚本会把这些原因翻译成人话打印出来，但结论一样：**只能人工录入**。
- **抓到的只是「面值」。** 站点是「1 元 = 1 美元」还是按汇率收人民币，接口不告诉你。所以自动抓取只写 `data/observed/`，人工确认后手抄进 `data/providers/`（或直接改这份 json 里的 `assumption`）。
- **模型名各站不同。** `claude-3-5-sonnet-20241022`、`claude-sonnet-4-5` 这类写法靠 `data/models.json` 里的 `aliases` 匹配；匹配不上会列在 `unmatched` 里，照着补别名即可。
- **按次计费的模型**（图片、视频）`quota_type = 1`，没有 token 单价，直接跳过，不会算成 0 混进排名。

### 自动扫到的站：默认不上架，人工确认才上

自动扫描只是**发现**，不是**上架**。`data/sources.json` 里每条都有 `approved` 字段，默认 `false`：

```bash
node scripts/approve.mjs --list              # 已上架 N 家 / 待确认 M 家
node scripts/approve.mjs api-top.com         # 确认上架（同时打印它能上榜的模型与价格）
node scripts/approve.mjs api-top.com --off   # 撤回
npm run build                                # 或 npm run weekly，一次抓+构建+审计
```

为什么卡这一道：66 家里有相当一部分把「特价池 / 号池 / 按次计费」写进同一张倍率表，出现 0.03×、37.5× 这类数；自动判定只能剔除形状对不上的，剩下要人看一眼才敢挂。

确认之后这些行才会出现，并过两道闸：

1. **逐行判定**：只有 `derivation.models[].verdict === "ok"` 的行才上，也就是「站上的输出/输入比 == 官方的输出/输入比」。
2. **不覆盖人工数据**：`data/providers/<id>.json` 里录过的站，自动数据自动让位。

这些行的 `kind` 是 `relay`（页面显示「中转·未分类」），`price_source` 是 `auto`（显示「自动抓取」），`risk_flags` 带 `unverified`。

### 停更一个站点：改一个字段

跑路了、暂停营业、或者你暂时不想推它，都不需要删文件（删了历史价格和推广链接就没了）：

```json
{ "status": "paused" }
```

`status` 三档：`active`（默认，上榜）· `paused`（暂停，不上榜但要观察）· `dead`（已关站，留着存档）。构建会跳过非 `active` 的站点，并在日志里列出来。

---

### 全站模型目录（按模型查价）

`data/models.json` 只维护 6 个人工核验的模型；其余模型不丢，全部落在 `data/catalog/<站点>.json` 里（每站 `/api/pricing` 的完整模型表）。

```bash
node scripts/build-catalog.mjs        # 汇总成 data/models-auto.json，并生成页面用的 dist/catalog.json
```

- 模型名先归一成「家族」：去日期后缀、`:free`、`-healthcare/-law/-preview`、`-thinking` 等，`gpt-6.2-sol-healthcare` 与 `gpt-6.2-sol` 算同一个。
- 被 ≥3 家站收录的才进页面（阈值 `--min` 可调），本次 380 个；只被 1–2 家卖的不上榜，避免独家噪声。
- 参照价优先级：`official.json`（人工核验）→ `data/openrouter-models.json`（OpenRouter 公开价）→ 无。没参照价的只显示绝对价。
- 页面底部「按模型查价」里输入模型名即可看到它在 60 家站的报价横排；倍数远大于 3 的用 `37.5×` 这类中性标记，不用「贵 21 倍」，因为那通常是号池/统一价口径。

### 充值优惠与站内汇率

充值赠送（充 100 得 120）**不挂在公开 API 上**，抓不到，只能人工录 `recharge` 字段。但 `/api/status` 里有一个更关键的东西：

| 字段 | 含义 | 例 |
| --- | --- | --- |
| `usd_exchange_rate` | 这家站 1 美元额度要多少人民帺 | beehears `1` / qinzhiai `7.3` / 36niu `7` |
| `price` | 站内额度单价（多数与上面同值） | `7.3` |
| `custom_currency_symbol` | 展示符号 | `$` 或 `¤` |
| `top_up_link` | 充值入口 | `https://happp.cn/links/...` |

**折算方式（2026-11-27 调整）**：按美元额度计价的行，真实人民币价 = 官方美元价 × 倍率 × **站内汇率**。

```
beehears  官方 $2 × 0.1（自动分组）× 1.0  = ¥0.2/M      # 1 元买 1 美元额度
qinzhiai  官方 $2 × 0.3（分组）    × 7.3  = ¥4.38/M     # 1 美元额度真要 ¥7.3
无声明汇率 官方 $2 × 0.5（分组）    × 1.0  = ¥1.0/M      # 按惯例 1:1，计算方式里会注明
```

页面站点名下会打 `1$=¥7.3` 标签，说明这行的价钱是乘过这个汇率的；没声明的站在「计算方式」里写明「按 1 元 = 1 美元额度的常见惯例算」。

## 日常维护

> 完整流程见 **[MAINTAIN.md](MAINTAIN.md)**（口径约定、常见故障、每周四步）。

**每周只要一条命令**：

```bash
node scripts/weekly.mjs --md
```

它依次跑 抓汇率 → 抓 68 家中转站 → 抓 OpenRouter 对照 → 逐行判定 → 构建 → 审计，最后对比 `data/price-history/` 最近两轮，输出「涨 N 个 / 跌 N 个 / 哪几家没抓到 / 跳变异常」的周报（`--md` 额外存一份 `data/observed/WEEKLY.md`）。抓取失败不会中止，判定或构建失败才会。

这个项目的维护成本刻意压在三件事上：**改一个数、加一个文件、每周跑一次审计**。

| 什么时候 | 做什么 | 花多久 |
| --- | --- | --- |
| 某站调价 | 改它 `multiplier.value`（如果是单个模型调价，才改模型条目） | 10 秒 |
| 有新站要推 | `npm run add -- ...` 生成文件，填推广链接 | 1 分钟 |
| 某站关站 | 把 `status` 改成 `dead` | 5 秒 |
| 每周一次 | `npm run audit`，按清单挑着处理 | 5 分钟 |
| 每月一次 | 对一遍厂商计费页，更新 `data/official.json` 的 `as_of` | 10 分钟 |

`npm run audit` 会扫出这些情况（红=必须处理，黄=建议，灰=看看就好）：

- 官方基准价多久没复核（超过 45 天提醒，超过 90 天报警——它是全站折扣的分母）；
- 哪些站点没写 `price_updated_at`、或价格超过 45 天没核对；
- 抓取失败的站（HTTP 非 200，通常意味着关站或换接口了）；
- 探活可用率低于 90%、或连续 3 天没有成功请求的站；
- 没有推广链接的站（等于白送流量）、推广链接没填邀请码的站；
- 重复收录的域名、非法的 homepage URL；
- 还没替换掉的演示数据、已标记 `paused`/`dead` 的站。

加 `--md` 会输出 Markdown 清单，可以直接贴进 GitHub Issue 当待办：

```bash
npm run audit:md
```

还有一条兜底规则：**数据陈旧不会让站点挂掉，但会让结论变错**。所以 `build` 只做结构校验，时效性判断全部交给 `audit`——它只提醒，不擅自改数据。

---

## 自动化

自动化全在 `.github/workflows/update.yml` 和 `check.yml` 两个文件里。

**现在是手动档：没有开定时任务。** 定时抓取一行注释就能打开——等 `data/sources.json` 里的站点稳定、你也确认了哪些站抓得到之后再说，避免每天几十条 failed 的 commit 把仓库刷脏。

- **手动触发**（Actions 页面点 Run workflow）：抓取 → 探活 → 构建 → 提交 `data/` 与 `dist/` → 部署 Pages
- **push 触发**（改了 `data/**` 或 `scripts/**`）：只构建 + 部署，不动数据

打开定时：

```yaml
# .github/workflows/update.yml 顶部
on:
  schedule:
    - cron: '17 */6 * * *'
```

开启 Pages：仓库 **Settings → Pages → Source: GitHub Actions**。

探活密钥（可选，没有就跳过）：**Settings → Secrets → New repository secret**

```
PROBE_KEYS = {"my-station":"sk-xxxx","another-station":"sk-yyyy"}
```

站点侧再补上（可选）：

```json
"probe": { "base_url": "https://api.my-site.com/v1", "model": "claude-sonnet-5-5" }
```

`probe.mjs` 不存 key、不打印 key，只记录成功/失败、延迟、指纹通过数、`usage ÷ 本地估算` 的比值。

> 注意：GitHub 会在仓库 60 天无提交后自动停用定时任务；本仓库每次运行都会提交 `dist/`，所以不会触发。Fork 后需要先手动跑一次。

---

## 规则（也是这个项目的底线）

1. **排序只看折算后的真实价格**，不看返佣比例、不看谁给的钱多、不卖榜位。
2. **有推广链接必须标注**，构建设置了硬校验，`disclosure: true` 少一个字都过不了。
3. **价格必须可回溯**，每个站点都能点回它自己的定价页。
4. **不推荐、不背书**，只做数据；风险标签和可用率一并展示，判断权在读者。
5. **被站点投诉价格错误 → 先下线，再核实**。

---

## 风险提示

价格低到一定程度，通常意味着渠道不是官方直连。arXiv 上有一篇对影子 API 的实测研究（[Real Money, Fake Models](https://arxiv.org/abs/2603.01919)）：

- 在被学术引用过的 17 个中转站里，**45.83%** 的节点没通过模型身份验证
- 部分影子接口在专业问答上的正确率比官方低 **40 个百分点以上**
- 价格倍率本身**几乎不能预测**这种劣化

所以本站除了价格，还标 `逆向 / 低价陷阱 / 疑似掉包 / 计费虚高`；探活得到的可用率和计费系数在后台记录（`data/health/`），计费系数直接参与「现价」折算。便宜和稳定，自己权衡；重要业务建议直接走官方。

---

## 目录结构

```
token-radar/
├── config.json              # 站点名、汇率、混合权重、推广披露文案
├── data/
│   ├── models.json          # 规范模型 id + 别名 + 官方模型名
│   ├── rankings.json        # OpenRouter 一周 token 消耗排行（下拉排序用）
│   ├── official.json        # 官方价（USD/百万），含 verified_at 与来源链接
│   ├── providers/*.json     # 一站一文件：价格、充值、计费系数、推广链接、风险标签
│   ├── sources.json         # 待抓站点清单
│   ├── observed/*.json      # 自动抓取的候选价（/api/pricing）
│   ├── price-history/*.jsonl# 每次抓取一行，用于算涨跌
│   └── health/*.json        # 探活记录（日粒度）
├── schema/provider.schema.json
├── scripts/
│   ├── build.mjs            # 校验 + 折算 + 出静态站
│   ├── audit.mjs            # 维护审计：列出该人工看一眼的东西
│   ├── fetch-pricing.mjs    # 抓取 CLI：加站/发现接口/抓取/比价
│   ├── demo-crawl.mjs       # 抓取链路自检（起假站点，跑两轮看涨跌）
│   ├── probe.mjs            # 探活 + 指纹 + 计费系数
│   ├── add-station.mjs      # 脚手架
│   └── lib/                 # normalize / render / client / css / crawl（网络+解析+对比）
├── tests/
│   ├── crawl.test.mjs       # 抓取链路单测（含本地假站点）
│   └── fixtures/            # 离线解析用的样例响应
└── dist/                    # 产物（已提交，可直接用 Pages 托管）
```

---

## 路线图

- [ ] 官方价自动同步（各厂页面结构差异大，先保持人工 + `verified_at`）
- [ ] 历史价格曲线（`data/price-history/*.jsonl` 已经在记了，还差前端折线图）
- [ ] 模型级「降智」实测（固定题集跑分，横向对比，成本较高）
- [ ] 按使用场景出榜（Agent / 翻译 / 长文摘要的输入输出配比不同）
- [ ] RSS / JSON API 给其他工具引用

## 不做的事

- 不收录无主体、无定价页的站
- 不做「推荐指数」这类主观评分
- 不接付费排名
- 不替任何站点做担保

## License

MIT
