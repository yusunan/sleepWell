# Dota 2 Turbo 加速模式数据分析

纯前端 Dota 2 加速模式（Turbo）个人数据分析工具。输入 Steam32 ID 即可查看加速模式的详细数据。

## 功能

- 🔍 **玩家搜索**：输入 Steam32 ID（或 Steam64 ID 自动转换）
- 📊 **数据总览**：总场次、胜率、场均 KDA、平均 GPM/XPM、最长连胜
- 📈 **胜率趋势**：折线图展示近期 Turbo 比赛胜率变化
- 🦸 **英雄表现**：可排序表格，展示各英雄在加速模式下的详细数据
- 📋 **比赛记录**：最近 Turbo 比赛列表，含 KDA/GPM/XPM/时长

## 使用方法

### 直接打开（需要本地服务器）

由于使用了 ES Modules，需要通过 HTTP 服务器打开：

```bash
# Python 3
python3 -m http.server 8080

# 然后访问 http://localhost:8080
```

### 部署到静态托管

所有文件都是静态文件，可以直接部署到：
- GitHub Pages
- Netlify
- Vercel
- 任意静态文件服务器

### 如何获取 Steam32 ID

1. 打开 Dota 2 客户端，主界面左上角可以看到你的"好友 ID"（32 位数字）
2. 或者在 OpenDota 网站搜索你的昵称
3. 或者从 Steam 个人资料 URL 中的 Steam64 ID 转换（自动支持）

## 技术栈

- 纯前端（HTML + CSS + Vanilla JS ES Modules）
- Chart.js v4（CDN）
- OpenDota API
- 零构建工具、零 npm 依赖

## API 说明

数据来源：[OpenDota API](https://docs.opendota.com/)

- GET 请求支持 CORS，可直接从浏览器调用
- 免费版每分钟约 60 次请求
- 本工具使用 localStorage 缓存减少重复请求

### game_mode 22 vs 23

根据官方 protobuf 枚举：
- **23** = `DotaGamemodeTurbo`（加速模式）
- **22** = `DotaGamemodeAllDraft`（All Draft）

在实际使用中，部分玩家历史数据中 22 也被用作加速模式。本工具会同时查询两种模式并合并数据。

## 文件结构

```
dd2/
├── index.html          # 入口页面
├── css/
│   └── style.css       # Dota 2 暗色主题
├── js/
│   ├── config.js       # 常量配置
│   ├── storage.js      # localStorage 缓存
│   ├── api.js          # OpenDota API 客户端
│   ├── charts.js       # Chart.js 图表
│   ├── ui.js           # DOM 渲染
│   └── app.js          # 主控制器
└── README.md
```
