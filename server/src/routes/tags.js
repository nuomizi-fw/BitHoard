import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/connection.js';
import { dbWrite, dbPatch, dbHardDelete } from '../database/helpers.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routes-tags');
const router = Router();

/**
 * 获取所有标签
 * GET /api/tags
 */
router.get('/', (req, res) => {
  const db = getDb();
  const tags = db.prepare(`
    SELECT t.*, COUNT(rt.resource_id) as resource_count
    FROM tag t
    LEFT JOIN resource_tag rt ON t.id = rt.tag_id
    GROUP BY t.id
    ORDER BY t.name
  `).all();
  res.json(tags);
});

/**
 * 创建标签
 * POST /api/tags
 */
router.post('/', async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const db = getDb();
  const existing = db.prepare('SELECT * FROM tag WHERE name = ?').get(name);
  if (existing) return res.json(existing);

  const id = uuidv4();
  await dbWrite('INSERT INTO tag (id, name, color) VALUES (?, ?, ?)', id, name, color || '#6366f1');

  res.status(201).json(db.prepare('SELECT * FROM tag WHERE id = ?').get(id));
});

/**
 * 更新标签
 * PATCH /api/tags/:id
 */
router.patch('/:id', async (req, res) => {
  const { notFound, record } = await dbPatch('tag', 'id', req.params.id, req.body, ['name', 'color']);
  if (notFound) return res.status(404).json({ error: 'Tag not found' });
  res.json(record);
});

/**
 * 删除标签
 * DELETE /api/tags/:id
 */
router.delete('/:id', async (req, res) => {
  await dbHardDelete('tag', 'id', req.params.id);
  res.json({ success: true });
});

/**
 * 为资源添加标签
 * POST /api/resources/:resourceId/tags
 */
router.post('/resources/:resourceId/tags', async (req, res) => {
  await dbWrite('INSERT OR IGNORE INTO resource_tag (resource_id, tag_id) VALUES (?, ?)', req.params.resourceId, req.body.tag_id);
  res.json({ success: true });
});

/**
 * 移除资源的标签
 * DELETE /api/resources/:resourceId/tags/:tagId
 */
router.delete('/resources/:resourceId/tags/:tagId', async (req, res) => {
  await dbWrite('DELETE FROM resource_tag WHERE resource_id = ? AND tag_id = ?', req.params.resourceId, req.params.tagId);
  res.json({ success: true });
});

export default router;
