/**
 * 数据库写入队列
 * 将所有写操作排成串行队列，防止 SQLITE_BUSY
 */
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
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        console.error('[write-queue] Error:', err.message);
        reject(err);
      }
    }

    this.processing = false;
  }
}

// 单例
const writeQueue = new WriteQueue();
export default writeQueue;
