# Token 雷达 · AI 中转站 × 官方 价格排行

把 AI API 中转站的「倍率」「充值赠送」「计费虚高」折算成**人民币 / 百万 token 的真实到手价**，再和官方直购价对齐比较。GitHub Actions 定时抓取 + 探活，静态站一键部署到 Pages。

**在线站：<https://wunankun.github.io/token-radar/>** ｜ 仓库：<https://github.com/wunankun/token-radar>

![预览](docs/preview.png)

> 仓库里的 `demo-alpha / demo-beta / demo-gamma` 是**演示数据**（`demo: true`），只为展示折算和排序效果。换成真实站点后自动消失。

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
实际到手价 = 标价 × 计费系数 ÷ 充值赠送倍数
混合成本   = 0.7 × 输入价 + 0.3 × 输出价        # config.json 可改，表里的「现价」
优惠力度   = 1 − 现价 ÷ 官方价                  # 百分比越大越优惠，负数表示比官方贵
```

榜单按「优惠力度」从大到小排，官方直购作为基准行（优惠力度显示「官方」）。

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

---

## 数据从哪来

| 来源 | 做法 | 标记 |
| --- | --- | --- |
| 官方价 | 人工读厂商计费页，记录 `verified_at` 与来源链接（`data/official.json`） | 官方计费页 |
| 中转站价（人工） | 编辑 `data/providers/<id>.json` | 人工核验 |
| 中转站价（自动） | `fetch-pricing.mjs` 拉 new-api / one-api 的公开 `GET /api/pricing` | 自动抓取（未核验） |
| 可用率 | 有 key 的站点探活，只统计最近 7 天（`data/health/`） | 后台记录，不占榜单列 |

自动抓取当前**手动触发**（`node scripts/fetch-pricing.mjs --write`），定时任务还没开，原因见下面「抓取」一节。

自动抓取只写 `data/observed/`，**人工确认后才进 `data/providers/`**。因为 `/api/pricing` 返回的是「站内面值」，只有确认了这站是「1 元 = 1 美元」还是按汇率收人民币，才能正确换算成人民币价。

官方价里还有几个现实变量，先按标准档记录，明细都在 `data/official.json` 的 `note` 里：

- DeepSeek 有峰谷价（谷时 5 折）
- Anthropic 有 5 分钟 / 1 小时缓存写入价、100K 以上长上下文加价
- OpenAI 有 Batch / 长上下文档

---

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
| `data/sources.json` | 待抓站点清单（`enabled: false` 可临时停抓） |
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

**几个现实情况，先说清楚：**

- **不少站抓不到。** 实测中很常见的是 Cloudflare 人机验证（403）、接口被关（404）、或者压根不是 new-api。脚本会把这些原因翻译成人话打印出来，但结论一样：**只能人工录入**。
- **抓到的只是「面值」。** 站点是「1 元 = 1 美元」还是按汇率收人民币，接口不告诉你。所以自动抓取只写 `data/observed/`，人工确认后手抄进 `data/providers/`（或直接改这份 json 里的 `assumption`）。
- **模型名各站不同。** `claude-3-5-sonnet-20241022`、`claude-sonnet-4-5` 这类写法靠 `data/models.json` 里的 `aliases` 匹配；匹配不上会列在 `unmatched` 里，照着补别名即可。
- **按次计费的模型**（图片、视频）`quota_type = 1`，没有 token 单价，直接跳过，不会算成 0 混进排名。

---

## 加一个站点（带你的推广链接）

一个站点一个文件，`data/providers/<id>.json`：

```json
{
  "id": "my-station",
  "name": "某站",
  "kind": "official-relay",
  "homepage": "https://my-site.com",
  "pricing_url": "https://my-site.com/pricing",
  "first_seen": "2026-11-26",
  "affiliate": {
    "url": "https://my-site.com/register?aff=YOUR_CODE",
    "code": "YOUR_CODE",
    "commission": "10%",
    "disclosure": true
  },
  "recharge": { "pay": 100, "get": 120, "note": "充 100 得 120" },
  "billing": { "ratio": 1.0, "measured_at": "2026-11-20" },
  "risk_flags": [],
  "models": {
    "claude-sonnet-5-5": { "mode": "multiplier", "base": "cny_official", "value": 0.62 },
    "deepseek-v4-pro":   { "mode": "absolute", "input": 4.5, "output": 13.5 }
  }
}
```

也可以用脚手架生成：

```bash
node scripts/add-station.mjs --id my-station --name "某站" --kind official-relay \
  --homepage https://my-site.com --pricing https://my-site.com/pricing \
  --aff "https://my-site.com/register?aff=YOUR_CODE" \
  --model claude-sonnet-5-5 --mult 0.62 --base cny_official
```

`kind` 取值：`official`（官方直购）· `official-relay`（官转）· `reverse`（逆向/号池）· `mixed`（混合）· `aggregator`（聚合商）。

`risk_flags` 可选：`unverified` `reverse` `cheap-trap` `billing-inflation` `model-substitution` `no-entity` `operator-self` `ran-away` `no-refund` `prepaid-only` `limited-models`。

完整 schema 见 [`schema/provider.schema.json`](schema/provider.schema.json)。

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
│   ├── models.json          # 规范模型 id + 别名（用于匹配各站不同的模型命名）
│   ├── official.json        # 官方价（USD/百万），含 verified_at 与来源链接
│   ├── providers/*.json     # 一站一文件：价格、充值、计费系数、推广链接、风险标签
│   ├── sources.json         # 待抓站点清单
│   ├── observed/*.json      # 自动抓取的候选价（/api/pricing）
│   ├── price-history/*.jsonl# 每次抓取一行，用于算涨跌
│   └── health/*.json        # 探活记录（日粒度）
├── schema/provider.schema.json
├── scripts/
│   ├── build.mjs            # 校验 + 折算 + 出静态站
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
