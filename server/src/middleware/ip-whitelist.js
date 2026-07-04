import config from '../config.js';

/**
 * IP 白名单中间件
 * 本地请求（127.0.0.1 / ::1 / localhost）始终放行
 */
export function ipWhitelistMiddleware(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress || '';

  // 本地地址始终放行
  if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp.startsWith('::ffff:127.')) {
    return next();
  }

  // 检查白名单
  const whitelist = config.ipWhitelist;
  if (whitelist.length === 0) {
    return res.status(403).json({ error: 'Remote access disabled' });
  }

  const allowed = whitelist.some(entry => {
    // 精确匹配
    if (entry === clientIp) return true;
    // 处理 IPv4-mapped IPv6
    if (clientIp.startsWith('::ffff:') && entry === clientIp.substring(7)) return true;
    return false;
  });

  if (!allowed) {
    return res.status(403).json({ error: `IP ${clientIp} not in whitelist` });
  }

  next();
}
