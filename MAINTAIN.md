# 维护手册

一页纸的「每周怎么维护这个站」。新接手的人（或 AI agent）照这个做就行。

**节奏**：每周一次，约 30 分钟。真正需要人动脑的只有「核验 1–2 家站」那 10 分钟。

---

## 一、每周四步

```bash
# ① 抓 + 判 + 建 + 审 + 出周报（一条命令，联网约 1–3 分钟）
node scripts/weekly.mjs --md

# ② 看周报「下一步」和审计的 🔴 项，逐条处理（见第三节）

# ③ 核验 1–2 家自己注册过的站，写进 data/providers/（见 3.5）

# ④ 发布
git add -A && git commit -m "data: 第 N 周维护" && git push
```

`weekly.mjs` 依次跑：`fetch-fx` → `fetch-pricing --write` → `fetch-openrouter --write` → `explain-observed --write` → `build --strict` → `audit`，最后对比 `data/price-history/` 最近两轮，写出涨跌周报（`--md` 会额外存一份 `data/observed/WEEKLY.md`）。

抓取步骤失败不会中止（网络抖动、站点关停都是常态），但**判定或构建失败会立即中止**——那说明数据真的坏了。

### 只想离线检查

```bash
node scripts/weekly.mjs --skip-fetch   # 不联网，只重算 + 审计 + 周报
npm test                               # 15 个单元测试（抓取/解析/发现接口）
npm run build:strict                   # 构建，warning 也算失败（CI 的口径）
```

---

## 二、口径约定（改动前先读，这些是踩过坑定下来的）

| 事项 | 约定 | 为什么 |
| --- | --- | --- |
| 计价公式 | `输入$ = model_ratio × 2 × group_ratio`，`输出 = 输入 × completion_ratio`，`缓存 = 输入 × cache_ratio` | one-api 口径 1 USD = 500000 quota |
| 面值惯例 | 多数站「1 元 = 1 美元额度」，倍率 0.5 就是 ¥0.5 实付 | 不这么算会凭空多算 6.6 倍 |
| 人民币口径 | **实付**：`标价 × 计费系数`，充值赠送**不折进价格** | 用户拍板：充值优惠单独一列 |
| 美元口径 | 同一笔实付 ÷ 汇率（`fetch-fx` 自动抓） | 两个口径优惠力度必须一致 |
| 选哪个分组 | `auto_groups` 最便宜的非限用途档 → `enable_groups` 最便宜档 → `default` | `default` 是占位符（「自动选择你能用的分组」），不是价格 |
| 限用途档 | 名字/描述命中 `订阅|按次|生图|视频|测试|试用|体验|临时|单独建Key` 就跳过 | 否则会算出假便宜 |
| 倍率下限 | 结果 < 官方 2% 就退回默认档 | 防包月/活动池刷榜 |
| 形状闸 | `completion_ratio` 与官方 `output/input` 误差 >20% 的行不上榜 | 防按次计费站被算成 250× |
| 优惠力度 | `1 − 混合成本 ÷ 官方混合成本`，混合 = 0.7×输入 + 0.3×输出 | 单一数字排序，权重在 `config.json` 可改 |

改算法时**务必**把 `scripts/fetch-pricing.mjs` 里的 `PRICING_VERSION` 加 1：周报只对比同版本记录，否则算法改动会被误读成「全站调价」。

---

## 三、常见情况怎么办

### 3.1 某站挂了 / 流程跑不通

`data/sources.json` 里给它：

```json
{ "id": "xxx-com", "enabled": false, "status": "broken",
  "disabled_at": "2026-11-27", "note": "官网流程跑不通，用户实测" }
```

效果：以后不再抓、不上榜、页面底部灰字说明「已停用 X 家：域名（原因）」。快照和历史保留，方便日后核对；要彻底删就删 `data/observed/<id>.json` 与 `data/price-history/<id>.jsonl`。

修好了：把 `enabled` 改回 `true` 即可。

### 3.2 某站改了分组倍率，价格跳变

周报里「跳变超过 200%」的那几条多半是这种。看一眼它的 `/api/pricing`：

- 分组表变了 → 不用改代码，`pick-group.mjs` 会自动按新表选档；
- 站上用了 `billing_mode: tiered_expr` 且表达式不是线性倍率 → 这站没法逐模型算，考虑停用；
- 你确定某站该用固定分组 → 在 `data/sources.json` 里写 `"group_ratio": 0.5`，抓取时按这一组折算。

### 3.3 官方调价（每月看一眼就够）

改 `data/official.json` 对应模型的 `usd.input/output/cache_read`，并把 `as_of` 更新到今天。审计会在官方价超过 45 天时提醒。

### 3.4 新增一个站

```bash
node scripts/add-station.mjs --id newsite-com --name "NewSite" --kind official-relay \
  --homepage https://newsite.com --pricing https://newsite.com/pricing \
  --aff "https://newsite.com/register?code=YOURS" --mult 0.6 --base cny_official
npm run build:strict
```

`--kind` 五选一：`official`（官方直购）/ `official-relay`（官转）/ `reverse`（逆向）/ `mixed`（混合）/ `aggregator`（聚合）。只抓不核验的站走 `add` 也行，但会被标「未核验」。

### 3.5 核验一家站（每周最高价值动作）

这是把「54 家未核验」变成可信数据的唯一路径，也是挂推广链接的正规位置：

1. 自己注册、充值、实际跑一次，确认价格和分组；
2. 从 `data/sources.json` 拿掉这条，在 `data/providers/<id>.json` 建人工记录：

```json
{
  "id": "newsite-com", "name": "NewSite", "kind": "official-relay",
  "homepage": "https://newsite.com", "pricing_url": "https://newsite.com/pricing",
  "price_updated_at": "2026-11-27",
  "affiliate": { "url": "https://newsite.com/register?code=YOURS", "code": "YOURS", "disclosure": true },
  "multiplier": { "base": "cny_official", "value": 0.62 },
  "models": { "claude-sonnet-5-5": {}, "gpt-6.2-sol": { "value": 0.55 } }
}
```

3. `npm run build:strict` → 这家的行会显示「人工核验」+ 你的推广链接（带 AD 标记）。

**底线**：`disclosure` 必须为 `true`；不许为了返佣调排序（排序永远按到手价）。

### 3.6 换掉演示数据

`data/providers/demo-*.json` 三份 + `data/health/demo-*.json` 三份，删掉即从榜单消失。审计里那条 🔴 就是提醒这个。

---

## 四、文件地图

| 路径 | 作用 |
| --- | --- |
| `config.json` | 站名、汇率、混合权重、披露文案、仓库地址 |
| `data/models.json` | 6 个标准模型 + 别名（抓取时靠别名匹配） |
| `data/official.json` | 官方价基准（USD/百万），榜单的「官方价」就从这来 |
| `data/providers/*.json` | **人工核验**的站（价格 + 推广链接 + 风险标签） |
| `data/sources.json` | 自动抓取的站清单（`enabled` / `status` / `group_ratio`） |
| `data/observed/<id>.json` | 最近一次快照：模型价、分组、判定（`derivation`）、HTTP 状态 |
| `data/price-history/<id>.jsonl` | 每轮一行，涨跌和周报都基于它 |
| `data/health/<id>.json` | 探活结果（`scripts/probe.mjs`，需要 key） |
| `dist/` | 构建产物（`index.html` + `prices.json`），由 git 跟踪并部署 |
| `scripts/weekly.mjs` | 每周一条命令 |
| `scripts/audit.mjs` | 只读体检，🔴/🟡/⚪ 三级，`--md` 出勾选清单 |

---

## 五、发布与验证

```bash
npm run build:strict && node scripts/audit.mjs   # 本地自检
git add -A && git commit -m "data: ..." && git push
```

Pages 大约 60–120 秒后生效。验证：

```bash
curl -s https://wunankun.github.io/token-radar/ | grep -c 'id="pager"'   # 应该是 1
curl -s https://wunankun.github.io/token-radar/ | grep -o '已停用 [0-9]* 家'
```

CI（`.github/workflows/check.yml`）会在 push 时跑测试 + `build --strict` + 产物大小检查；构建失败会挡住部署。

---

## 六、应急

| 症状 | 处理 |
| --- | --- |
| 构建报「未知的定价模式 undefined」 | provider 里模型条目写了 `{"value": …}` 但站点没写 `multiplier`，补上站点级倍率 |
| 某行价格离谱（几十上百倍） | 打开 `data/observed/<id>.json` 看 `derivation.models[].verdict`：`shape` = 不是按 token 卖，`legacy` = 旧型号名 |
| 页面数字和老版本不一致 | 多半是改了口径：看 `PRICING_VERSION` 和 git log 里的口径提交 |
| 推送失败（`bad record mac` / `SSL_ERROR_SYSCALL`） | 重试 2–3 次；仍失败用仓库根目录 `.push_api.py`（GitHub API 逐 blob 推送） |
