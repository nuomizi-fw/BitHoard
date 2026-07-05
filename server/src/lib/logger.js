/**
 * 共享日志工具 (Server 端 - ESM)
 *
 * 每个独立模块通过 createLogger(moduleName) 获取专属 logger。
 * 日志同时输出到控制台（stderr） + 写入 data/logs/{moduleName}.log（按天滚动）。
 *
 * 用法：
 *   import { createLogger } from '../lib/logger.js';
 *   const log = createLogger('server');
 *
 *   // 兼容旧写法（默认 INFO 级别）
 *   log('Server started on port 13002');
 *
 *   // 推荐使用级别方法
 *   log.info('Server started');
 *   log.warn('Disk space low');
 *   log.error('Crash:', err);
 *   log.debug('Request body:', obj);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 请求上下文（跨异步调用传播 requestId）──
const _requestContext = new AsyncLocalStorage();

// ── 日志级别定义 ──
const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LEVEL_LABELS = { 0: 'DEBUG', 1: 'INFO ', 2: 'WARN ', 3: 'ERROR' };

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
 * 确保日志目录存在，返回日志目录路径
 * @returns {string|null} 日志目录路径，失败返回 null
 */
function ensureLogDir() {
  try {
    const logDir = getLogDir();
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    return logDir;
  } catch (err) {
    console.error('[logger] Failed to create log directory:', err.message);
    return null;
  }
}

/**
 * 获取（或创建）当天的文件写入流
 * @param {string} moduleName
 * @returns {fs.WriteStream|null}
 */
function getStream(moduleName) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    let entry = _streams.get(moduleName);

    if (!entry || entry.date !== today) {
      // 日期变更：关闭旧流
      if (entry && entry.stream) {
        try { entry.stream.end(); } catch {}
      }

      const logDir = ensureLogDir();
      if (!logDir) return null;

      const filePath = path.join(logDir, `${moduleName}.log`);
      const stream = fs.createWriteStream(filePath, { flags: 'a' });
      entry = { stream, date: today };
      _streams.set(moduleName, entry);
    }
    return entry.stream;
  } catch (err) {
    console.error(`[logger] Failed to open log stream for "${moduleName}":`, err.message);
    return null;
  }
}

/**
 * 将参数序列化为日志消息字符串
 * @param {any[]} args
 * @returns {string}
 */
function formatMessage(args) {
  return args.map(a => {
    if (a instanceof Error) {
      return a.stack || a.message;
    }
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

/**
 * 写入一条日志（内部方法）
 * @param {string} moduleName
 * @param {number} level - 日志级别
 * @param {any[]} args
 */
function writeLog(moduleName, level, args) {
  const ts = new Date().toISOString();
  const label = LEVEL_LABELS[level] || 'INFO ';
  const prefix = `[${moduleName}]`;
  const ctx = _requestContext.getStore();
  const rid = ctx?.requestId ? ` [${ctx.requestId}]` : '';
  const msg = formatMessage(args);
  const line = `${ts} ${label} ${prefix}${rid} ${msg}`;

  // 控制台输出（WARN/ERROR → stderr，其余 → stdout）
  if (level >= LEVELS.WARN) {
    console.error(line);
  } else {
    console.log(line);
  }

  // 文件日志
  const stream = getStream(moduleName);
  if (stream) {
    try {
      stream.write(line + '\n');
    } catch (err) {
      console.error(`[logger] Failed to write to log file for "${moduleName}":`, err.message);
    }
  }
}

/**
 * 创建模块专属 logger
 * @param {string} moduleName - 模块名，对应日志文件名 {moduleName}.log
 * @returns {Function & {info: Function, warn: Function, error: Function, debug: Function}}
 */
export function createLogger(moduleName) {
  /**
   * 默认日志函数（INFO 级别），兼容旧写法 log('message')
   */
  function log(...args) {
    writeLog(moduleName, LEVELS.INFO, args);
  }

  log.info  = (...args) => writeLog(moduleName, LEVELS.INFO, args);
  log.warn  = (...args) => writeLog(moduleName, LEVELS.WARN, args);
  log.error = (...args) => writeLog(moduleName, LEVELS.ERROR, args);
  log.debug = (...args) => writeLog(moduleName, LEVELS.DEBUG, args);

  return log;
}

/**
 * 在当前异步上下文中设置 requestId
 * 应在 Express 中间件中调用，之后同一请求链路的所有 log 调用自动带上该 ID
 * @param {string} requestId
 * @param {Function} fn - 在该上下文中执行的函数
 * @returns {any}
 */
export function runWithRequestId(requestId, fn) {
  return _requestContext.run({ requestId }, fn);
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
