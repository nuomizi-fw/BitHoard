/**
 * 共享日志工具 (Server 端 - ESM)
 * 每个独立模块通过 createLogger(moduleName) 获取专属 logger，
 * 日志同时输出到控制台 + 写入 data/logs/{moduleName}.log（按天滚动）。
 *
 * 用法：
 *   import { createLogger } from '../lib/logger.js';
 *   const log = createLogger('server');
 *   log('Server started on port 13002');
 *   log('Error:', err.message);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, {stream: fs.WriteStream, date: string}>} */
const _streams = new Map();

/**
 * 获取 data/logs 目录路径
 * server/src/lib/logger.js → 项目根目录/data/logs
 */
function getLogDir() {
  return path.join(__dirname, '..', '..', '..', 'data', 'logs');
}

/**
 * 创建模块专属 logger
 * @param {string} moduleName - 模块名，对应日志文件名 {moduleName}.log
 * @returns {(message: string) => void}
 */
export function createLogger(moduleName) {
  const prefix = `[${moduleName}]`;
  const fileName = `${moduleName}.log`;

  return (...args) => {
    const ts = new Date().toISOString();
    const msg = args.map(a => {
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    }).join(' ');

    // 控制台输出
    console.log(prefix, msg);

    // 文件日志（按天滚动）
    try {
      const today = new Date().toISOString().slice(0, 10);
      let entry = _streams.get(moduleName);

      if (!entry || entry.date !== today) {
        if (entry && entry.stream) {
          try { entry.stream.end(); } catch {}
        }
        const logDir = getLogDir();
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        const stream = fs.createWriteStream(path.join(logDir, fileName), { flags: 'a' });
        entry = { stream, date: today };
        _streams.set(moduleName, entry);
      }

      entry.stream.write(`${ts} ${prefix} ${msg}\n`);
    } catch {}
  };
}

/**
 * 关闭所有日志流（应用退出时调用）
 */
export function closeAllLoggers() {
  for (const [name, entry] of _streams) {
    try { entry.stream.end(); } catch {}
  }
  _streams.clear();
}
