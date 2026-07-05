import jwt from 'jsonwebtoken';
import config from '../config.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('middleware-auth');

/**
 * JWT 鉴权中间件
 */
export function authMiddleware(req, res, next) {
  // WebSocket 升级请求跳过鉴权（在 upgrade 时处理）
  if (req.headers.upgrade?.toLowerCase() === 'websocket') {
    return next();
  }

  // 白名单路径跳过鉴权（注意：req.path 不含 /api 前缀，因为中间件挂在 /api 下）
  const publicPaths = ['/auth/login', '/auth/status'];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  let token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    // <img>/<a> 等标签不发送 Authorization 头，支持通过查询参数传递 token
    token = req.query.token;
  }

  if (!token) {
    log.warn('Missing token from', req.ip, 'path:', req.path);
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    next();
  } catch (err) {
    log.warn('Invalid token from', req.ip, 'path:', req.path);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
