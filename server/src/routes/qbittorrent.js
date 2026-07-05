import { Router } from 'express';
import qbClient from '../services/qbittorrent.js';
import torrentParser from '../services/torrent-parser.js';
import { getDb } from '../database/connection.js';
import { dbWrite } from '../database/helpers.js';
import { cacheFilesFromQbittorrent } from '../services/file-cache.js';

const router = Router();

/**
 * 测试 qBittorrent 连接
 * GET /api/qbittorrent/status
 */
router.get('/status', async (req, res) => {
  const result = await qbClient.testConnection();
  res.json(result);
});

/**
 * 获取 qBittorrent 任务列表
 * GET /api/qbittorrent/torrents
 */
router.get('/torrents', async (req, res) => {
  try {
    const torrents = await qbClient.getTorrents();
    res.json(torrents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 获取特定任务的文件列表
 * GET /api/qbittorrent/torrents/:hash/files
 */
router.get('/torrents/:hash/files', async (req, res) => {
  try {
    const files = await qbClient.getTorrentFiles(req.params.hash);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 暂停任务
 * POST /api/qbittorrent/torrents/:hash/pause
 */
router.post('/torrents/:hash/pause', async (req, res) => {
  const ok = await qbClient.pauseTorrent(req.params.hash);
  res.json({ success: ok });
});

/**
 * 恢复任务
 * POST /api/qbittorrent/torrents/:hash/resume
 */
router.post('/torrents/:hash/resume', async (req, res) => {
  const ok = await qbClient.resumeTorrent(req.params.hash);
  res.json({ success: ok });
});

/**
 * 删除任务
 * DELETE /api/qbittorrent/torrents/:hash
 */
router.delete('/torrents/:hash', async (req, res) => {
  const deleteFiles = req.body?.deleteFiles || false;
  const ok = await qbClient.deleteTorrent(req.params.hash, deleteFiles);
  res.json({ success: ok });
});

/**
 * 获取传输信息
 * GET /api/qbittorrent/transfer
 */
router.get('/transfer', async (req, res) => {
  const info = await qbClient.getTransferInfo();
  res.json(info);
});

/**
 * 获取种子元数据并缓存
 * POST /api/qbittorrent/fetch-metadata/:resourceId
 * 对已添加但暂停的任务，等待元数据加载，提取后缓存 .torrent 和文件列表
 */
router.post('/fetch-metadata/:resourceId', async (req, res) => {
  const { resourceId } = req.params;
  const db = getDb();

  const download = db.prepare('SELECT * FROM download WHERE resource_id = ?').get(resourceId);
  if (!download || !download.qb_task_hash) {
    return res.status(404).json({ error: 'No active download with qB task found' });
  }

  try {
    const props = await qbClient.getTorrentProperties(download.qb_task_hash);
    if (!props) {
      return res.status(500).json({ error: 'Failed to get torrent properties' });
    }

    // 获取文件列表并缓存
    const files = await qbClient.getTorrentFiles(download.qb_task_hash);
    if (files && files.length > 0) {
      cacheFilesFromQbittorrent(resourceId, files);
    }

    // 更新下载记录
    await dbWrite(
      "UPDATE download SET total_size = ?, updated_at = datetime('now') WHERE resource_id = ?",
      props.total_size || 0, resourceId
    );

    res.json({
      name: props.name || '',
      totalSize: props.total_size || 0,
      pieceLength: props.piece_length || 0,
      fileCount: files?.length || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 导出数据库 (完整备份)
 * GET /api/qbittorrent/export
 */
router.get('/export', (req, res) => {
  // 这个应该在专门的备份路由，暂时放这里
  // TODO: 移动到 backup 路由
  res.json({ message: 'Use /api/backup/export' });
});

export default router;
