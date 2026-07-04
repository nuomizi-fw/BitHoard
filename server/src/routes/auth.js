import { Router } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config.js';

const router = Router();

/**
 * 登录
 * POST /api/auth/login
 * Body: { password: string }
 */
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password || password !== config.adminPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign(
    { role: 'admin', iat: Math.floor(Date.now() / 1000) },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.json({ token, expiresIn: config.jwtExpiresIn });
});

/**
 * 检查登录状态
 * GET /api/auth/status
 */
router.get('/status', (req, res) => {
  res.json({
    authEnabled: true,
    ipWhitelist: config.ipWhitelist,
  });
});

/**
 * 登出
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Token cleared on client' });
});

/**
 * 修改密码
 * PUT /api/auth/password
 * Body: { oldPassword: string, newPassword: string }
 */
router.put('/password', (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'oldPassword and newPassword required' });
  }

  if (oldPassword !== config.adminPassword) {
    return res.status(401).json({ error: 'Invalid old password' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  // 运行时更新密码
  config.adminPassword = newPassword;
  console.log('[auth] Admin password changed');

  res.json({ success: true });
});

/**
 * 获取当前配置 (不含密码)
 * GET /api/auth/config
 */
router.get('/config', (req, res) => {
  res.json({
    qbHost: config.qbittorrent.host,
    qbUsername: config.qbittorrent.username,
    ipWhitelist: config.ipWhitelist,
  });
});

export default router;
