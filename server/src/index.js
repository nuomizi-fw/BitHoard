import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import expressWs from 'express-ws';
import config from './config.js';
import { getDb, closeDb } from './database/connection.js';
import { authMiddleware } from './middleware/auth.js';
import { ipWhitelistMiddleware } from './middleware/ip-whitelist.js';
import wsService from './websocket/index.js';

// 路由
import authRoutes from './routes/auth.js';
import resourceRoutes from './routes/resources.js';
import downloadRoutes from './routes/downloads.js';
import tagRoutes from './routes/tags.js';
import groupRoutes from './routes/groups.js';
import searchRoutes from './routes/search.js';
import qbRoutes from './routes/qbittorrent.js';
import tmdbRoutes from './routes/tmdb.js';
import exportRoutes from './routes/export.js';
import miscRoutes from './routes/misc.js';

const app = express();
expressWs(app);

// ── 基础中间件 ──
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'image/*', limit: '20mb' }));

// ── IP 白名单 ──
app.use(ipWhitelistMiddleware);

// ── 健康检查（鉴权之前，无需 token）──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── 鉴权 ──
app.use('/api', authMiddleware);

// ── API 路由 ──
app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/qbittorrent', qbRoutes);
app.use('/api/tmdb', tmdbRoutes);
app.use('/api/export', exportRoutes);
app.use('/api', miscRoutes);

// ── 前端静态文件 (生产模式) ──
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistPath = path.join(__dirname, '..', '..', 'web', 'dist');

if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(webDistPath, 'index.html'));
    }
  });
}

// ── WebSocket ──
wsService.init(app);

/** @type {import('http').Server|null} */
let httpServer = null;

/**
 * 启动服务器（供 Electron 主进程或独立运行调用）
 * @param {object} [options]
 * @param {number} [options.port] - 监听端口，默认使用 config.port
 * @param {string} [options.host] - 监听地址，默认使用 config.host
 * @returns {Promise<{ app: import('express').Express, server: import('http').Server }>}
 */
export async function startServer(options = {}) {
  const port = options.port ?? config.port;
  const host = options.host ?? config.host;

  // 初始化数据库
  getDb();

  return new Promise((resolve, reject) => {
    httpServer = app.listen(port, host, () => {
      console.log(`[BitHoard] Server running at http://${host}:${port}`);
      console.log(`[BitHoard] WebSocket at ws://${host}:${port}/ws`);
      resolve({ app, server: httpServer });
    });
    httpServer.on('error', reject);
  });
}

/**
 * 关闭服务器（释放端口、数据库、WebSocket）
 */
export async function stopServer() {
  // 1. 先停止 WS 轮询并强制关闭所有客户端连接
  wsService.stop();

  // 2. 关闭 HTTP 服务器（强制断开所有连接，避免等待 keep-alive/WS 导致挂起）
  if (httpServer) {
    httpServer.closeAllConnections?.();  // Node 18.2+, 强制断开所有活跃连接
    await new Promise((resolve) => httpServer.close(resolve));
    httpServer = null;
  }

  // 3. 关闭数据库
  closeDb();
}

// ── 独立运行时自动启动 ──
// 当通过 `node src/index.js` 直接运行时，自动调用 startServer
// 被 Electron import 时不会执行（通过检查是否为 ESM 主入口）
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  startServer().catch((err) => {
    console.error('[BitHoard] Failed to start:', err);
    process.exit(1);
  });

  // 优雅退出
  process.on('SIGINT', async () => {
    await stopServer();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopServer();
    process.exit(0);
  });
}
