# 🧲 BitHoard

磁链资源管理与下载工具 —— 收集、评价、检索、下载一站式管理。

## 技术栈

| 层 | 技术 |
|---|------|
| 桌面壳 | Electron |
| 前端 | Svelte 4 + Vite |
| 后端 | Express.js |
| 数据库 | SQLite (better-sqlite3, WAL 模式) |
| 下载后端 | qBittorrent v4.5.0.10 |

## 功能

- 📋 **剪贴板监控** — 自动识别磁链/种子/ed2k 链接，识别来源应用
- 🧾 **批量暂存** — 一次复制多个链接进入暂存区，支持批量编辑
- 🏷️ **标签 + 分组** — 灵活的多标签系统，扁平分组建档
- ⭐ **评分与评价** — 五星评分 + 文字评价
- 📷 **截图管理** — 支持粘贴截图，自动生成缩略图
- 🔍 **全维度检索** — 文件名反查、Meta 全文搜索、高级筛选
- 📥 **qBittorrent 集成** — 添加/暂停/删除/进度同步
- 🎬 **TMDB 自动补全** — 影视资源自动匹配海报/简介/评分
- 🌐 **Web 远程访问** — JWT 鉴权 + IP 白名单
- 🔔 **系统托盘** — 后台常驻，自定义 Toast 浮窗内嵌编辑

## 快速开始

```bash
# 安装所有依赖
pnpm install

# 开发模式 (三个进程并行: server + web + electron)
pnpm dev

# 或者分别启动
pnpm dev:server   # 后端 http://localhost:13002
pnpm dev:web      # 前端 http://localhost:5173
pnpm dev:electron # Electron 桌面端
```

## 配置

配置通过环境变量或 `server/.env`:

```env
SERVER_PORT=13002
JWT_SECRET=your-secret-here
ADMIN_PASSWORD=your-password
QB_HOST=http://localhost:8080
QB_USERNAME=admin
QB_PASSWORD=adminadmin
TMDB_API_KEY=your-tmdb-key
IP_WHITELIST=127.0.0.1,192.168.1.0/24
```

## 项目结构

```
BitHoard/
├── electron/           # Electron 主进程
│   ├── main.js         # 入口 + 托盘 + 全局快捷键
│   ├── preload.js      # 上下文桥接
│   └── clipboard-monitor.js  # 剪贴板监控
├── server/             # Express 后端
│   └── src/
│       ├── index.js    # 服务入口
│       ├── config.js   # 配置管理
│       ├── database/   # 数据库连接 + 迁移 + 写入队列
│       ├── middleware/  # JWT鉴权 + IP白名单
│       ├── routes/     # API 路由
│       ├── services/   # qBittorrent / TMDB / 解析器 / 磁盘检查
│       └── websocket/  # WebSocket 推送
└── web/                # Svelte 前端
    └── src/
        ├── components/  # 通用组件
        ├── routes/      # 页面路由
        ├── lib/         # API客户端 + Svelte Stores
        └── App.svelte   # 根组件
```
