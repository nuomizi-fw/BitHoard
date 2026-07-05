import { Router } from 'express';
import { getDb } from '../database/connection.js';
import { buildResourceWhereClause, buildOrderClause, SCREENSHOT_SUBQUERY } from '../lib/query-builder.js';

const router = Router();

/**
 * 全文搜索
 * GET /api/search?q=keyword&type=resource|file|all&page=1&limit=50
 */
router.get('/', (req, res) => {
  const db = getDb();
  const { q, type = 'all', page = 1, limit = 50 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const results = { query: q, resources: null, files: null };

  if (type === 'resource' || type === 'all') {
    const { whereClause, params } = buildResourceWhereClause({ search: q, is_deleted: 0 });
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM resource r ${whereClause}`).get(params);
    const items = db.prepare(`
      SELECT r.*, ${SCREENSHOT_SUBQUERY}
      FROM resource r ${whereClause}
      ORDER BY r.updated_at DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit: parseInt(limit), offset });
    results.resources = { total, items };
  }

  if (type === 'file' || type === 'all') {
    const fileCountSql = `
      SELECT COUNT(DISTINCT fc.resource_id) as total
      FROM file_cache fc
      JOIN resource r ON fc.resource_id = r.id
      WHERE r.is_deleted = 0 AND fc.file_path LIKE @q
    `;
    const { total } = db.prepare(fileCountSql).get({ q: `%${q}%` });

    const fileSql = `
      SELECT fc.*, r.title as resource_title, r.magnet_uri, r.category
      FROM file_cache fc
      JOIN resource r ON fc.resource_id = r.id
      WHERE r.is_deleted = 0 AND fc.file_path LIKE @q
      ORDER BY fc.file_size DESC
      LIMIT @limit OFFSET @offset
    `;
    results.files = {
      total,
      items: db.prepare(fileSql).all({ q: `%${q}%`, limit: parseInt(limit), offset }),
    };
  }

  res.json(results);
});

/**
 * 高级筛选
 * POST /api/search/advanced
 */
router.post('/advanced', (req, res) => {
  const db = getDb();
  const {
    q, status, category, rating_min, rating_max,
    tags, groups, source_app, has_download,
    sort = 'updated_at', order = 'desc',
    page = 1, limit = 50,
  } = req.body;

  const { whereClause, params } = buildResourceWhereClause({
    search: q, status, category, rating_min, rating_max,
    source_app, has_download, is_deleted: 0,
  });
  const { safeSort, safeOrder } = buildOrderClause(sort, order);

  const offset = (parseInt(page) - 1) * parseInt(limit);

  // tags/groups 数组参数需要手动构建（better-sqlite3 命名参数不支持数组展开）
  const conditions = [whereClause.replace(/^WHERE\s*/, '') || 'r.is_deleted = 0'];
  const flatParams = [];

  if (tags && tags.length > 0) {
    conditions.push(`r.id IN (SELECT resource_id FROM resource_tag WHERE tag_id IN (${tags.map(() => '?').join(',')}))`);
    flatParams.push(...tags);
  }
  if (groups && groups.length > 0) {
    conditions.push(`r.id IN (SELECT resource_id FROM resource_group WHERE group_id IN (${groups.map(() => '?').join(',')}))`);
    flatParams.push(...groups);
  }

  const finalWhere = `WHERE ${conditions.join(' AND ')}`;

  const countSql = `SELECT COUNT(*) as total FROM resource r ${finalWhere}`;
  const bindValues = [...Object.values(params), ...flatParams];
  const { total } = db.prepare(countSql).get(...bindValues);

  const sql = `
    SELECT r.*, ${SCREENSHOT_SUBQUERY}
    FROM resource r
    ${finalWhere}
    ORDER BY ${safeSort} ${safeOrder}
    LIMIT ? OFFSET ?
  `;
  const items = db.prepare(sql).all(...bindValues, parseInt(limit), offset);

  res.json({ total, page: parseInt(page), limit: parseInt(limit), items });
});

export default router;
