import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  // 服务器
  port: parseInt(process.env.SERVER_PORT || '13002', 10),
  host: process.env.SERVER_HOST || '127.0.0.1',

  // 数据库 — 存放在项目根目录 data/db/ 下 (符合 data-location 规范)
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'db', 'bithoard.db'),

  // JWT 鉴权
  jwtSecret: process.env.JWT_SECRET || 'bithoard-change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  // IP 白名单 (逗号分隔, 空=仅本地)
  ipWhitelist: (process.env.IP_WHITELIST || '').split(',').filter(Boolean),

  // 本地回环地址 (始终放行，不依赖白名单配置)
  localAddresses: ['127.0.0.1', '::1', 'localhost'],

  // IPv4-mapped IPv6 本地前缀
  localIPv6Prefixes: ['::ffff:127.0.0.1', '::ffff:127.'],

  // 管理员密码 (单用户)
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',

  // qBittorrent
  qbittorrent: {
    host: process.env.QB_HOST || 'http://localhost:8080',
    username: process.env.QB_USERNAME || 'admin',
    password: process.env.QB_PASSWORD || 'adminadmin',
    version: 'v4.5.0.10',
  },

  // TMDB
  tmdb: {
    apiKey: process.env.TMDB_API_KEY || '',
    language: process.env.TMDB_LANGUAGE || 'zh-CN',
  },

  // 磁盘检查
  diskCheck: {
    minFreeGB: parseInt(process.env.DISK_MIN_FREE_GB || '10', 10),
  },

  // 截图缩略图尺寸
  thumbnailSize: 256,
};
