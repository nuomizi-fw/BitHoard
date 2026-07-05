/**
 * 共享日志工具
 * 每个独立模块通过 createLogger(moduleName) 获取专属 logger，
 * 日志同时输出到控制台 + 写入 data/logs/{moduleName}.log（按天滚动）。
 *
 * 用法：
 *   const { createLogger } = require('./logger');
 *   const log = createLogger('main');
 *   log('Server started on port 13002');
 *   log('Error:', err.message);
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/** @type {Map<string, {stream: fs.WriteStream, date: string}>} */
const _streams = new Map();

/**
 * 获取 data/logs 目录路径
 * - 开发模式：electron/../data/logs
 * - 生产模式：exe所在目录/data/logs
 */
function getLogDir() {
  try {
    const isDev = !app.isPackaged;
    return isDev
      ? path.join(__dirname, '..', 'data', 'logs')
      : path.join(path.dirname(app.getPath('exe')), 'data', 'logs');
  } catch {
    // app 尚未 ready 时的 fallback
    return path.join(__dirname, '..', 'data', 'logs');
  }
}

/**
 * 创建模块专属 logger
 * @param {string} moduleName - 模块名，对应日志文件名 {moduleName}.log
 * @returns {(message: string) => void}
 */
function createLogger(moduleName) {
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
function closeAllLoggers() {
  for (const [name, entry] of _streams) {
    try { entry.stream.end(); } catch {}
  }
  _streams.clear();
}

module.exports = { createLogger, closeAllLoggers };
