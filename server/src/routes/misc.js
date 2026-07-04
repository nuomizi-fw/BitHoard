import { Router } from 'express';
import { getDb } from '../database/connection.js';
import config from '../config.js';

const router = Router();

/**
 * 统计概览
 * GET /api/stats
 */
router.get('/stats', (req, res) => {
  const db = getDb();

  const totalResources = db.prepare('SELECT COUNT(*) as count FROM resource WHERE is_deleted = 0').get().count;
  const draftCount = db.prepare("SELECT COUNT(*) as count FROM resource WHERE is_deleted = 0 AND status = 'draft'").get().count;
  const activeCount = db.prepare("SELECT COUNT(*) as count FROM resource WHERE is_deleted = 0 AND status = 'active'").get().count;

  // 评分分布
  const ratingDist = db.prepare(`
    SELECT rating, COUNT(*) as count FROM resource
    WHERE is_deleted = 0 AND rating > 0
    GROUP BY rating ORDER BY rating
  `).all();

  // 下载统计
  const downloadingCount = db.prepare("SELECT COUNT(*) as count FROM download WHERE download_status = 'downloading'").get().count;
  const completedCount = db.prepare("SELECT COUNT(*) as count FROM download WHERE download_status = 'completed'").get().count;
  const totalDownloadedSize = db.prepare("SELECT SUM(downloaded_size) as total FROM download WHERE download_status = 'completed'").get().total || 0;

  // 分类分布
  const categoryDist = db.prepare(`
    SELECT category, COUNT(*) as count FROM resource
    WHERE is_deleted = 0
    GROUP BY category ORDER BY count DESC
  `).all();

  res.json({
    resources: { total: totalResources, draft: draftCount, active: activeCount },
    downloads: { downloading: downloadingCount, completed: completedCount, totalDownloadedSize },
    ratings: ratingDist,
    categories: categoryDist,
  });
});

/**
 * 操作日志列表
 * GET /api/history?resource_id=&action=&page=1&limit=50
 */
router.get('/history', (req, res) => {
  const db = getDb();
  const { resource_id, action, page = 1, limit = 50 } = req.query;

  const conditions = [];
  const params = {};

  if (resource_id) {
    conditions.push('h.resource_id = @resource_id');
    params.resource_id = resource_id;
  }
  if (action) {
    conditions.push('h.action = @action');
    params.action = action;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM history h ${whereClause}`).get(params);
  const items = db.prepare(`
    SELECT h.*, r.title as resource_title
    FROM history h
    LEFT JOIN resource r ON h.resource_id = r.id
    ${whereClause}
    ORDER BY h.created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: parseInt(limit), offset });

  res.json({ total, page: parseInt(page), limit: parseInt(limit), items });
});

/**
 * 获取当前配置 (公开配置)
 * GET /api/config
 */
router.get('/config', (req, res) => {
  res.json({
    port: config.port,
    host: config.host,
    ipWhitelist: config.ipWhitelist,
    qbHost: config.qbittorrent.host,
    qbUsername: config.qbittorrent.username,
    version: '0.1.0',
  });
});

export default router;
