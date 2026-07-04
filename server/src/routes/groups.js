import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/connection.js';
import writeQueue from '../database/write-queue.js';

const router = Router();

/**
 * 获取所有分组
 * GET /api/groups
 */
router.get('/', (req, res) => {
  const db = getDb();
  const groups = db.prepare(`
    SELECT g.*, COUNT(rg.resource_id) as resource_count
    FROM "group" g
    LEFT JOIN resource_group rg ON g.id = rg.group_id
    GROUP BY g.id
    ORDER BY g.name
  `).all();
  // 去除 cover BLOB 减少传输
  res.json(groups.map(g => ({ ...g, cover: g.cover ? true : false })));
});

/**
 * 获取单个分组详情
 * GET /api/groups/:id
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const group = db.prepare('SELECT * FROM "group" WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const resources = db.prepare(`
    SELECT r.* FROM resource r
    JOIN resource_group rg ON r.id = rg.resource_id
    WHERE rg.group_id = ? AND r.is_deleted = 0
    ORDER BY r.created_at DESC
  `).all(req.params.id);

  res.json({ ...group, resources });
});

/**
 * 创建分组
 * POST /api/groups
 */
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const db = getDb();
  const existing = db.prepare('SELECT * FROM "group" WHERE name = ?').get(name);
  if (existing) return res.json({ ...existing, cover: !!existing.cover });

  const id = uuidv4();
  await writeQueue.enqueue(() => {
    db.prepare('INSERT INTO "group" (id, name, description) VALUES (?, ?, ?)').run(id, name, description || '');
  });

  res.status(201).json(db.prepare('SELECT * FROM "group" WHERE id = ?').get(id));
});

/**
 * 更新分组
 * PATCH /api/groups/:id
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const db = getDb();
  const group = db.prepare('SELECT * FROM "group" WHERE id = ?').get(id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const setClauses = [];
  const updates = { id };

  if (name !== undefined) { setClauses.push('name = @name'); updates.name = name; }
  if (description !== undefined) { setClauses.push('description = @description'); updates.description = description; }

  if (setClauses.length > 0) {
    await writeQueue.enqueue(() => {
      db.prepare(`UPDATE "group" SET ${setClauses.join(', ')} WHERE id = @id`).run(updates);
    });
  }

  res.json(db.prepare('SELECT * FROM "group" WHERE id = ?').get(id));
});

/**
 * 删除分组
 * DELETE /api/groups/:id
 */
router.delete('/:id', async (req, res) => {
  await writeQueue.enqueue(() => {
    const db = getDb();
    db.prepare('DELETE FROM "group" WHERE id = ?').run(req.params.id);
  });
  res.json({ success: true });
});

/**
 * 将资源添加到分组
 * POST /api/groups/:groupId/resources/:resourceId
 */
router.post('/:groupId/resources/:resourceId', async (req, res) => {
  await writeQueue.enqueue(() => {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO resource_group (resource_id, group_id) VALUES (?, ?)').run(req.params.resourceId, req.params.groupId);
  });
  res.json({ success: true });
});

/**
 * 从分组移除资源
 * DELETE /api/groups/:groupId/resources/:resourceId
 */
router.delete('/:groupId/resources/:resourceId', async (req, res) => {
  await writeQueue.enqueue(() => {
    const db = getDb();
    db.prepare('DELETE FROM resource_group WHERE resource_id = ? AND group_id = ?').run(req.params.resourceId, req.params.groupId);
  });
  res.json({ success: true });
});

export default router;
