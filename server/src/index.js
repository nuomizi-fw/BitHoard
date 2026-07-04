import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import expressWs from 'express-ws';
import config from './config.js';
import { getDb } from './database/connection.js';
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

// ── 健康检查 ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── 启动服务器 ──
getDb(); // 初始化数据库

const { port, host } = config;
app.listen(port, host, () => {
  console.log(`[BitHoard] Server running at http://${host}:${port}`);
  console.log(`[BitHoard] WebSocket at ws://${host}:${port}/ws`);
});

// 优雅退出
process.on('SIGINT', () => {
  wsService.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  wsService.stop();
  process.exit(0);
});
