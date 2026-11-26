# Token 雷达 · AI 中转站 × 官方 价格排行

把 AI API 中转站的「倍率」「充值赠送」「计费虚高」折算成**人民币 / 百万 token 的真实到手价**，再和官方直购价对齐比较。GitHub Actions 定时抓取 + 探活，静态站一键部署到 Pages。

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
相对官方   = 实际到手价 ÷ (官方美元价 × 汇率 USD→CNY)
混合成本   = 0.7 × 输入价 + 0.3 × 输出价        # config.json 可改
```

倍率的口径在数据里用 `base` 字段区分，混用会算出完全错误的排名：

- `base: "usd_official"` —— 倍率乘官方美元价，以人民币结算（逆向/低价站常见）
- `base: "cny_official"` —— 倍率乘官方人民币价（官转常见）

---

## 快速开始

零依赖，只要 Node ≥ 18。

```bash
git clone <your-repo> && cd token-radar
node scripts/build.mjs          # 生成 dist/index.html + dist/prices.json
open dist/index.html            # 直接看
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
| 中转站价（自动） | Actions 定时拉 new-api / one-api 的公开 `GET /api/pricing` | 自动抓取（未核验） |
| 可用率 | 有 key 的站点定时探活，只统计最近 7 天 | 7 日可用 |

自动抓取只写 `data/observed/`，**人工确认后才进 `data/providers/`**。因为 `/api/pricing` 返回的是「站内面值」，只有确认了这站是「1 元 = 1 美元」还是按汇率收人民币，才能正确换算成人民币价。

官方价里还有几个现实变量，先按标准档记录，明细都在 `data/official.json` 的 `note` 里：

- DeepSeek 有峰谷价（谷时 5 折）
- Anthropic 有 5 分钟 / 1 小时缓存写入价、100K 以上长上下文加价
- OpenAI 有 Batch / 长上下文档

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

`.github/workflows/update.yml`：每 6 小时（以及每次 `data/**` 变更）

1. `fetch-pricing.mjs --write` 拉公开价格 → `data/observed/`
2. `probe.mjs` 探活 + 5 道指纹题 + 实测计费系数 → `data/health/`
3. `build.mjs --strict` 构建
4. 提交 `data/` 与 `dist/`，部署到 GitHub Pages

开启方式：仓库 **Settings → Pages → Source: GitHub Actions**。

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

所以本站除了价格，还标 `逆向 / 低价陷阱 / 疑似掉包 / 计费虚高`，以及 7 日可用率。便宜和稳定，自己权衡；重要业务建议直接走官方。

---

## 目录结构

```
token-radar/
├── config.json              # 站点名、汇率、混合权重、推广披露文案
├── data/
│   ├── models.json          # 规范模型 id + 别名（用于匹配各站不同的模型命名）
│   ├── official.json        # 官方价（USD/百万），含 verified_at 与来源链接
│   ├── providers/*.json     # 一站一文件：价格、充值、计费系数、推广链接、风险标签
│   ├── observed/*.json      # 自动抓取的候选价（/api/pricing）
│   └── health/*.json        # 探活记录（日粒度）
├── schema/provider.schema.json
├── scripts/
│   ├── build.mjs            # 校验 + 折算 + 出静态站
│   ├── fetch-pricing.mjs    # new-api/one-api 公开价格抓取
│   ├── probe.mjs            # 探活 + 指纹 + 计费系数
│   ├── add-station.mjs      # 脚手架
│   └── lib/                 # normalize / render / client / css
├── tests/fixtures/          # 离线解析测试
└── dist/                    # 产物（已提交，可直接用 Pages 托管）
```

---

## 路线图

- [ ] 官方价自动同步（各厂页面结构差异大，先保持人工 + `verified_at`）
- [ ] 历史价格曲线（`data/snapshots/` 日快照 + 折线图）
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
