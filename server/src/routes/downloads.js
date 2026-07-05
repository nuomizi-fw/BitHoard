import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/connection.js';
import { dbWrite, dbWriteTransaction } from '../database/helpers.js';
import qbClient from '../services/qbittorrent.js';
import torrentParser from '../services/torrent-parser.js';
import diskChecker from '../services/disk-check.js';
import { cacheFilesFromTorrent } from '../services/file-cache.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routes-downloads');

const router = Router();

/**
 * 获取所有下载记录
 * GET /api/downloads
 */
router.get('/', (req, res) => {
  const db = getDb();
  const downloads = db.prepare(`
    SELECT d.*, r.title, r.magnet_uri, r.category as resource_category
    FROM download d
    JOIN resource r ON d.resource_id = r.id
    WHERE r.is_deleted = 0
    ORDER BY d.created_at DESC
  `).all();

  res.json(downloads);
});

/**
 * 创建下载任务
 * POST /api/downloads
 * Body: { resource_id, download_path, start_paused }
 */
router.post('/', async (req, res) => {
  const { resource_id, download_path, start_paused = true } = req.body;
  const db = getDb();

  const resource = db.prepare('SELECT * FROM resource WHERE id = ?').get(resource_id);
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  // 检查是否已有下载记录
  const existing = db.prepare('SELECT * FROM download WHERE resource_id = ?').get(resource_id);
  if (existing) {
    return res.status(409).json({ error: 'Download already exists', download: existing });
  }

  // 磁盘空间检查
  if (download_path) {
    const diskResult = diskChecker.check(download_path);
    if (diskResult && !diskResult.ok) {
      return res.status(400).json({
        error: 'Insufficient disk space',
        disk: diskResult,
      });
    }
  }

  // 测试 qB 连接
  if (!qbClient.connected) {
    await qbClient.login();
  }

  if (!qbClient.connected) {
    return res.status(503).json({ error: 'qBittorrent not connected' });
  }

  // 添加下载到 qBittorrent
  let success = false;
  try {
    if (resource.torrent_blob) {
      success = await qbClient.addTorrentFile(resource.torrent_blob, download_path || '', resource.category || '');
    } else {
      success = await qbClient.addTorrent(resource.magnet_uri, download_path || '', resource.category || '');
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add torrent to qBittorrent', message: err.message });
  }

  if (!success) {
    return res.status(500).json({ error: 'qBittorrent rejected the torrent' });
  }

  // 创建下载记录
  const downloadId = uuidv4();
  await dbWrite(
    `INSERT INTO download (id, resource_id, download_path, download_status, started_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    downloadId, resource_id, download_path || '', start_paused ? 'paused' : 'downloading'
  );

  // 记录日志
  await dbWrite(
    `INSERT INTO history (id, resource_id, action, detail) VALUES (?, ?, 'download_started', ?)`,
    uuidv4(), resource_id, JSON.stringify({ download_id: downloadId, path: download_path })
  );

  const download = db.prepare('SELECT * FROM download WHERE id = ?').get(downloadId);
  res.status(201).json(download);
});

/**
 * 更新下载状态 (由 WebSocket/qB 同步调用)
 * PATCH /api/downloads/:id
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const download = db.prepare('SELECT * FROM download WHERE id = ?').get(id);
  if (!download) {
    return res.status(404).json({ error: 'Download not found' });
  }

  const allowedFields = {
    download_status: 'download_status',
    total_size: 'total_size',
    downloaded_size: 'downloaded_size',
    completed_at: 'completed_at',
    qb_task_hash: 'qb_task_hash',
  };

  const setClauses = [];
  const updates = { id };

  for (const [bodyField, dbField] of Object.entries(allowedFields)) {
    if (req.body[bodyField] !== undefined) {
      setClauses.push(`${dbField} = @${bodyField}`);
      updates[bodyField] = req.body[bodyField];
    }
  }

  if (setClauses.length === 0) {
    return res.json(download);
  }

  setClauses.push('updated_at = datetime(\'now\')');

  // 如果标记为完成，设置完成时间
  if (req.body.download_status === 'completed' && !download.completed_at) {
    setClauses.push('completed_at = datetime(\'now\')');
  }

  await dbWrite(`UPDATE download SET ${setClauses.join(', ')} WHERE id = @id`, updates);

  // 下载完成时自动缓存文件列表
  if (req.body.download_status === 'completed') {
    const resource = db.prepare('SELECT * FROM resource WHERE id = ?').get(download.resource_id);
    if (resource?.torrent_blob) {
      const parsed = torrentParser.parse(resource.torrent_blob);
      if (parsed) {
        cacheFilesFromTorrent(download.resource_id, parsed);
      }
    }
  }

  const updated = db.prepare('SELECT * FROM download WHERE id = ?').get(id);
  res.json(updated);
});

/**
 * 删除下载记录
 * DELETE /api/downloads/:id
 * Body: { delete_qb_task: boolean, delete_files: boolean }
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { delete_qb_task = false, delete_files = false } = req.body;
  const db = getDb();

  const download = db.prepare('SELECT * FROM download WHERE id = ?').get(id);
  if (!download) {
    return res.status(404).json({ error: 'Download not found' });
  }

  // 如果关联了 qB 任务，同步删除
  if (delete_qb_task && download.qb_task_hash) {
    try {
      await qbClient.deleteTorrent(download.qb_task_hash, delete_files);
    } catch (err) {
      log('Failed to delete qB task:', err.message);
    }
  }

  await dbWrite('DELETE FROM download WHERE id = ?', id);

  await dbWrite(
    `INSERT INTO history (id, resource_id, action, detail) VALUES (?, ?, 'download_deleted', ?)`,
    uuidv4(), download.resource_id, JSON.stringify({ delete_files })
  );

  res.json({ success: true });
});

export default router;
