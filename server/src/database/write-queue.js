/**
 * 数据库写入队列
 * 将所有写操作排成串行队列，防止 SQLITE_BUSY
 */
import { createLogger } from '../lib/logger.js';

const log = createLogger('db');

let _wqSeq = 0;

class WriteQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  /**
   * 入队一个写操作
   * @param {Function} fn 返回 Promise 的写操作函数
   * @returns {Promise} 操作完成后的 Promise
   */
  enqueue(fn) {
    const seq = ++_wqSeq;
    log('ENQUEUE #' + seq + ', pending=' + this.queue.length);
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, seq });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing) {
      log('processQueue SKIP (already processing), pending=' + this.queue.length);
      return;
    }
    this.processing = true;
    log('processQueue START, tasks=' + this.queue.length);

    while (this.queue.length > 0) {
      const { fn, resolve, reject, seq } = this.queue.shift();
      log('EXEC #' + seq + ', remaining=' + this.queue.length);
      try {
        const t0 = Date.now();
        const result = await fn();
        log('#' + seq + ' DONE ' + (Date.now() - t0) + 'ms');
        resolve(result);
      } catch (err) {
        log('#' + seq + ' ERROR:', err.message);
        reject(err);
      }
    }

    this.processing = false;
    log('processQueue DONE (empty)');
  }
}

// 单例
const writeQueue = new WriteQueue();
export default writeQueue;
