/**
 * 共享常量 — BTIH / 磁链匹配模式
 *
 * 供 clipboard-monitor (Electron CJS) 和 title-extractor (Server ESM) 共用
 */
export const BTIH_PATTERNS = {
  /** 十六进制 40 位 BTIH hash */
  hex: /\b([a-fA-F0-9]{40})\b/g,
  /** Base32 编码 32 位 BTIH hash */
  base32: /\b([A-Z2-7a-z2-7]{32})\b/gi,
  /** 标准 magnet URI（hash 限定大写 Base32 防误匹配，dn 值可含空格） */
  magnet: /magnet:\?xt=urn:btih:(?:[a-fA-F0-9]{40}|[A-Z2-7]{32})(?=&|\r|\n|$)(?:&[a-zA-Z]+=[^&\r\n]+)*/gi,
  /** .torrent 文件 URL */
  torrentUrl: /https?:\/\/[^\s"'<>]+\.torrent/gi,
  /** ed2k 链接 */
  ed2k: /ed2k:\/\/\|file\|[^|]+\|[a-fA-F0-9]{32}\|/gi,
  /** 截断磁链（hash&dn=xxx&xl=xxx） */
  truncatedMagnet: /\b([A-Z2-7a-z2-7]{32}|[a-fA-F0-9]{40})(?:&[a-z]+=[^&\s<>"]+)+\b/gi,
};

/** 本地回环地址列表 */
export const LOCAL_ADDRESSES = ['127.0.0.1', '::1', 'localhost'];

/** IPv4-mapped IPv6 本地前缀 */
export const LOCAL_IPV6_PREFIXES = ['::ffff:127.0.0.1', '::ffff:127.'];

/** 资源排序白名单 */
export const ALLOWED_RESOURCE_SORTS = [
  'created_at', 'updated_at', 'title', 'rating', 'total_size', 'status', 'category',
];
