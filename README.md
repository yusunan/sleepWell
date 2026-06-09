# 睡了么 — Dota 2 加速模式睡眠分析

> 昨晚你睡好了吗？根据加速模式比赛记录，温柔评估睡眠质量。

## 功能

- 😴 **睡眠评估**：每晚 20:00 ~ 次日 02:00 的最后一把比赛时间、胜负、KDA，综合评分 0-100
- ⏰ **实时提醒**：20:00-02:00 访问时，根据当前战绩即时建议（赢了劝睡 / 输了鼓励或劝退）
- 👤 **本人/仇人/队友管理**：ID+备注存储在浏览器 localStorage，支持折叠
- 😈 **多面评价**：看自己用温柔安抚口吻，看仇人用批判嘲讽口吻，看队友用鼓励口吻
- 🏅 **天梯段位**：显示天梯奖章图标和中文段位名（先锋~冠绝）
- 📊 **加速模式概览**：总场次、胜率、场均 KDA、GPM/XPM、正补、英雄伤害(K)、天辉/夜魇胜率
- 📦 **版本筛选**：按 Patch 版本过滤，映射到游戏版本号（7.41 等）
- 📊 **版本答案**：当前版本加速模式胜率 TOP 20 英雄
- 🦸 **英雄表现**：全历史英雄场次/胜率（来自 API）+ 柱状图展示 TOP 10
- 📈 **胜率趋势**：近 20 场折线图
- 📋 **比赛记录**：最近加速模式比赛列表，可排序
- 👥 **近期队友/对手**：90 天内常排到的玩家，自动标记好基友/猪队友/铁畜生/真克星/真福星
- 👑 **与神同行**：查到的职业选手同排记录，可查看比赛详情
- 📱 **移动端适配**：侧边栏滑出式菜单、响应式布局
- ⏳ **全表格 Loading**：所有表格数据加载时显示 spinner 和文案
- 🔄 **版本更新检测**：自动检测新部署版本，清除旧缓存并刷新

## 使用

### 获取 Steam32 ID

1. Dota 2 客户端左上角"好友 ID"（32 位数字）
2. 或在 OpenDota 搜索昵称
3. 或输入 Steam64 ID（自动转换）

### 本地运行

```bash
python3 -m http.server 8080
# http://localhost:8080
```

### 部署

纯静态文件 → Cloudflare Pages / GitHub Pages / 任意静态托管。

## 评分规则

采样窗口：最近一个已结束的睡眠窗口（最近一次凌晨 2:00 → 前一天 20:00）。

| 维度 | 权重 | 说明 |
|------|------|------|
| 最后游戏时间 | 50% | 20:00=100，02:00=0 |
| 胜负 | 25% | 赢=100，输=0 |
| KDA | 25% | <1 得 30，1-10 线性 50→100，≥10 满分 |

## API

数据来源：[OpenDota API](https://docs.opendota.com/)。关键参数：`game_mode=23&significant=0` 过滤加速模式。

| 端点 | 用途 |
|------|------|
| `/players/{id}` | 玩家资料 + rank_tier |
| `/players/{id}/recentMatches` | 最近 Turbo 比赛（game_mode=23） |
| `/players/{id}/matches` | 与指定玩家同场的比赛（game_mode=23&included_account_id=X） |
| `/players/{id}/counts?game_mode=23&significant=0` | 加速模式全维度统计 |
| `/players/{id}/totals?game_mode=23&significant=0` | KDA/GPM/XPM/正补/英雄伤害 |
| `/players/{id}/wl?game_mode=23&significant=0` | 胜/负 |
| `/players/{id}/heroes?game_mode=23&significant=0` | 英雄场次/胜率 |
| `/players/{id}/peers?game_mode=23&significant=0&date=90` | 90 天内常排到的玩家 |
| `/players/{id}/pros?game_mode=23&significant=0` | 职业选手同排记录 |
| `/heroes` | 英雄名称映射 |
| `/heroStats` | 全局英雄统计（含 turbo_picks/turbo_wins） |

## 技术栈

纯前端 · Chart.js v4 · OpenDota API · localStorage · ES Modules · 零构建工具

## 缓存与版本更新

- `localStorage` 命名空间 `dd2_`，带 TTL 自动过期
- `_headers` 文件控制 Cloudflare Pages CDN 缓存策略
- `version.txt`（时间戳）+ 异步内联脚本自动检测新版本，清除旧缓存并强制刷新

## License

[BSL 1.1](LICENSE) — 非商业使用免费，2030-06-08 起自动转为 MIT License。
