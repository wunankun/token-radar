#!/usr/bin/env python3
"""生成分享卡片 docs/social-card.png（1200×630，用于 og:image）。

依赖：Pillow（python3 -m pip install pillow）。构建时 build.mjs 会把这张图复制到 dist/。
文案里的数字请跟当前榜单一致，改完重跑一次即可。
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (15, 23, 42)
INK = (241, 245, 249)
MUTED = (148, 163, 184)
ACCENT = (56, 189, 248)
WARM = (251, 146, 60)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/Songti.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
]


def font(size, bold=False):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            for idx in ([1, 0] if bold else [0, 1]):
                try:
                    return ImageFont.truetype(path, size, index=idx)
                except OSError:
                    continue
    raise SystemExit("找不到中文字体，改 FONT_CANDIDATES 里的路径")


def text(d, xy, s, f, fill=INK, anchor="la"):
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

# 顶部渐变细线
for i in range(6):
    d.line([(0, i), (W, i)], fill=(30, 58, 95 + i * 12))

# 品牌
text(d, (72, 76), "Token 雷达", font(78, bold=True))
text(d, (74, 178), "AI 中转站 × 官方直购 · 到账价排行", font(34), MUTED)
text(d, (74, 230), "倍率 / 美元计价 / 订阅套餐，统一折算成人民币 / 百万 token", font(24), MUTED)

# 主数字
text(d, (74, 318), "便宜", font(30), MUTED)
text(d, (146, 300), "90%", font(108, bold=True), WARM)
text(d, (74, 430), "Command Code · DeepSeek V4.1 Flash · ¥0.10/M", font(30), INK)

# 分隔线
d.line([(74, 494), (W - 74, 494)], fill=(51, 65, 85))

# 三个小指标
cols = [("12 家站", "官方 + 中转 + 订阅"), ("45 个模型", "输入 / 输出 / 缓存读"), ("逐条可回溯", "每行标价格来源")]
x = 74
for big, small in cols:
    text(d, (x, 520), big, font(34, bold=True), ACCENT)
    text(d, (x, 566), small, font(20), MUTED)
    x += 300

# 底部地址
text(d, (W - 74, 596), "wunankun.github.io/token-radar", font(20), MUTED, anchor="ra")

out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "social-card.png")
img.save(out, optimize=True)
print(f"✅ {out}")
