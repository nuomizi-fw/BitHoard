import qbClient from '../services/qbittorrent.js';
import { getDb } from '../database/connection.js';
import writeQueue from '../database/write-queue.js';

/**
 * WebSocket 服务
 * 用于实时推送 qBittorrent 下载进度到客户端
 * 进度数据不落库，只推送到订阅的客户端
 */
class WebSocketService {
  constructor() {
    this.clients = new Set();
    this.pollInterval = null;
    this.rid = 0;
  }

  /**
   * 初始化 WebSocket 端点
   */
  init(app) {
    app.ws('/ws', (ws, req) => {
      this.clients.add(ws);
      console.log('[ws] Client connected, total:', this.clients.size);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[ws] Client disconnected, total:', this.clients.size);
      });

      ws.on('error', (err) => {
        console.error('[ws] Client error:', err.message);
        this.clients.delete(ws);
      });

      // 发送初始数据
      this.sendToClient(ws, { type: 'connected', message: 'WebSocket connected' });
    });

    // 启动 qB 进度轮询 (仅在 qB 连接时)
    this.startPolling();
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(data) {
    const payload = JSON.stringify(data);
    for (const ws of this.clients) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error('[ws] Broadcast error:', err.message);
        this.clients.delete(ws);
      }
    }
  }

  /**
   * 发送给特定客户端
   */
  sendToClient(ws, data) {
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      console.error('[ws] Send error:', err.message);
      this.clients.delete(ws);
    }
  }

  /**
   * 启动 qB 进度轮询 (每2秒)
   */
  startPolling() {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      if (!qbClient.connected || this.clients.size === 0) return;

      try {
        const data = await qbClient.getSyncMainData(this.rid);
        if (!data) return;

        this.rid = data.rid || 0;

        // 解析 torrent 状态更新
        if (data.torrents) {
          const updates = [];
          const torrents = Object.entries(data.torrents);

          for (const [hash, torrent] of torrents) {
            updates.push({
              hash,
              name: torrent.name,
              state: torrent.state,
              progress: torrent.progress,
              dlspeed: torrent.dlspeed,
              upspeed: torrent.upspeed,
              size: torrent.size,
              downloaded: torrent.completed,
              eta: torrent.eta,
              num_leechs: torrent.num_leechs,
              num_seeds: torrent.num_seeds,
            });
          }

          if (updates.length > 0) {
            this.broadcast({
              type: 'qb_progress',
              server_state: data.server_state,
              torrents: updates,
            });
          }

          // 检查是否有任务完成，同步到数据库
          for (const [hash, torrent] of torrents) {
            if (torrent.state === 'uploading' || torrent.state === 'pausedUP') {
              // 任务完成，查找对应的下载记录并更新
              try {
                const db = getDb();
                const download = db.prepare(
                  'SELECT * FROM download WHERE qb_task_hash = ? AND download_status != ?'
                ).get(hash, 'completed');

                if (download) {
                  await writeQueue.enqueue(() => {
                    db.prepare(`
                      UPDATE download SET download_status = 'completed', completed_at = datetime('now'),
                      total_size = ?, downloaded_size = ?, updated_at = datetime('now')
                      WHERE id = ?
                    `).run(torrent.size || download.total_size, torrent.completed || download.downloaded_size, download.id);
                  });
                }
              } catch (err) {
                // 静默处理
              }
            }
          }
        }
      } catch (err) {
        // qB 连接断开时静默
      }
    }, 2000);
  }

  /**
   * 停止轮询
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * 通知客户端有新资源 (从剪贴板检测)
   */
  notifyNewResource(data) {
    this.broadcast({
      type: 'clipboard_detected',
      ...data,
    });
  }
}

const wsService = new WebSocketService();
export default wsService;
