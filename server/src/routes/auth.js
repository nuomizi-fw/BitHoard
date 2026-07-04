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

export default router;
