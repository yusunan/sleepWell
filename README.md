# 睡了么 — Dota 2 加速模式睡眠分析

> 昨晚你睡好了吗？根据加速模式比赛记录，温柔评估睡眠质量。

## 功能

- 😴 **睡眠评估**：每晚 20:00 ~ 次日 02:00 的最后一把比赛时间、胜负、KDA，综合评分 0-100
- ⏰ **实时提醒**：20:00-02:00 访问时，根据当前战绩即时建议（赢了劝睡 / 输了鼓励或劝退）
- 👤 **本人/仇人/队友管理**：ID+备注存储在浏览器 localStorage，支持折叠
- 😈 **多面评价**：看自己用温柔安抚口吻，看仇人用批判嘲讽口吻，看队友用鼓励口吻
- 📊 **加速模式概览**：总场次、胜率、场均 KDA、平均 GPM/XPM、最长连胜、天辉/夜魇胜率、核心/辅助比、隐藏分
- 📦 **版本筛选**：按 Patch 版本过滤，映射到游戏版本号（7.41 等）
- 🦸 **英雄表现**：全历史英雄场次/胜率（来自 API），可排序
- 📈 **胜率趋势**：近 20 场折线图
- 📋 **比赛记录**：最近加速模式比赛列表，可排序
- 👥 **近期队友/对手**：90 天内常排到的玩家，自动标记好基友/猪队友/铁畜生/真克星/真福星
- 🌟 **琅琊榜**：加速模式隐藏分排行榜（近 30 天活跃 TOP 30）
- 👑 **与神同行**：查到的职业选手同排记录
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
| KDA | 25% | 2-5 最佳，<1 或 >10 扣分 |

## API

数据来源：[OpenDota API](https://docs.opendota.com/)。关键参数：`game_mode=23&significant=0` 过滤加速模式。

| 端点 | 用途 |
|------|------|
| `/players/{id}` | 玩家资料 |
| `/players/{id}/recentMatches` | 最近比赛（含 mode=23 Turbo） |
| `/players/{id}/counts?game_mode=23&significant=0` | 加速模式全维度统计 |
| `/players/{id}/totals?game_mode=23&significant=0` | KDA/GPM/XPM |
| `/players/{id}/wl?game_mode=23&significant=0` | 胜/负 |
| `/players/{id}/heroes?game_mode=23&significant=0` | 英雄场次/胜率 |
| `/heroes` | 英雄名称映射 |

## 技术栈

纯前端 · Chart.js v4 · OpenDota API · localStorage · ES Modules · 零构建工具

## 缓存与版本更新

- `localStorage` 命名空间 `dd2_`，带 TTL 自动过期
- `_headers` 文件控制 Cloudflare Pages CDN 缓存策略
- `version.txt` + 内联脚本自动检测新版本，清除旧缓存并强制刷新
- 资源文件（CSS/JS）带 `?v=N` 版本号参数防止缓存

## License

[BSL 1.1](LICENSE) — 非商业使用免费，2030-06-08 起自动转为 MIT License。
