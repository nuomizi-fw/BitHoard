import config from '../config.js';

/**
 * 判断是否为本地回环地址
 */
function isLocalIp(clientIp) {
  if (config.localAddresses.includes(clientIp)) return true;
  return config.localIPv6Prefixes.some(prefix => clientIp.startsWith(prefix));
}

/**
 * 判断 IP 是否在白名单中
 */
function isIpAllowed(clientIp, whitelist) {
  return whitelist.some(entry => {
    if (entry === clientIp) return true;
    // 处理 IPv4-mapped IPv6
    if (clientIp.startsWith('::ffff:') && entry === clientIp.substring(7)) return true;
    return false;
  });
}

/**
 * IP 白名单中间件
 * 本地请求（127.0.0.1 / ::1 / localhost）始终放行
 */
export function ipWhitelistMiddleware(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress || '';

  // 本地地址始终放行
  if (isLocalIp(clientIp)) {
    return next();
  }

  // 检查白名单
  const whitelist = config.ipWhitelist;
  if (whitelist.length === 0) {
    return res.status(403).json({ error: 'Remote access disabled' });
  }

  if (!isIpAllowed(clientIp, whitelist)) {
    return res.status(403).json({ error: `IP ${clientIp} not in whitelist` });
  }

  next();
}
