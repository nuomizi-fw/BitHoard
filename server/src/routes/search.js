import { Router } from 'express';
import { getDb } from '../database/connection.js';

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
    const countSql = `
      SELECT COUNT(*) as total FROM resource r
      WHERE r.is_deleted = 0 AND (
        r.title LIKE @q OR r.description LIKE @q OR r.magnet_uri LIKE @q OR r.review LIKE @q
      )
    `;
    const { total } = db.prepare(countSql).get({ q: `%${q}%` });

    const sql = `
      SELECT r.*, (SELECT COUNT(*) FROM screenshot WHERE resource_id = r.id) as screenshot_count, (SELECT id FROM screenshot WHERE resource_id = r.id ORDER BY "order" LIMIT 1) as first_screenshot_id
      FROM resource r
      WHERE r.is_deleted = 0 AND (
        r.title LIKE @q OR r.description LIKE @q OR r.magnet_uri LIKE @q OR r.review LIKE @q
      )
      ORDER BY r.updated_at DESC
      LIMIT @limit OFFSET @offset
    `;
    results.resources = {
      total,
      items: db.prepare(sql).all({ q: `%${q}%`, limit: parseInt(limit), offset }),
    };
  }

  if (type === 'file' || type === 'all') {
    // 文件名反向搜索
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

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions = ['r.is_deleted = 0'];
  const params = {};

  if (q) {
    conditions.push('(r.title LIKE @q OR r.description LIKE @q OR r.magnet_uri LIKE @q)');
    params.q = `%${q}%`;
  }
  if (status) { conditions.push('r.status = @status'); params.status = status; }
  if (category) { conditions.push('r.category = @category'); params.category = category; }
  if (rating_min !== undefined) { conditions.push('r.rating >= @rating_min'); params.rating_min = rating_min; }
  if (rating_max !== undefined) { conditions.push('r.rating <= @rating_max'); params.rating_max = rating_max; }
  if (source_app) { conditions.push('r.source_app = @source_app'); params.source_app = source_app; }

  if (tags && tags.length > 0) {
    conditions.push(`r.id IN (SELECT resource_id FROM resource_tag WHERE tag_id IN (${tags.map(() => '?').join(',')}))`);
    // 这里需要手动构建，better-sqlite3 不支持数组参数展开，我们用动态 SQL
  }

  if (groups && groups.length > 0) {
    conditions.push(`r.id IN (SELECT resource_id FROM resource_group WHERE group_id IN (${groups.map(() => '?').join(',')}))`);
  }

  if (has_download === true) {
    conditions.push('r.id IN (SELECT resource_id FROM download)');
  } else if (has_download === false) {
    conditions.push('r.id NOT IN (SELECT resource_id FROM download)');
  }

  // 构建动态参数
  const flatParams = [];
  if (tags) flatParams.push(...tags);
  if (groups) flatParams.push(...groups);

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countSql = `SELECT COUNT(*) as total FROM resource r ${whereClause}`;
  const { total } = db.prepare(countSql).get(params);

  const sql = `
    SELECT r.*, (SELECT COUNT(*) FROM screenshot WHERE resource_id = r.id) as screenshot_count, (SELECT id FROM screenshot WHERE resource_id = r.id ORDER BY "order" LIMIT 1) as first_screenshot_id
    FROM resource r
    ${whereClause}
    ORDER BY r.${sort} ${sortOrder}
    LIMIT ? OFFSET ?
  `;

  // 合并参数：先放命名参数的值，再放 flat 参数
  const allParams = { ...params };
  const paramKeys = ['limit', 'offset'];
  const stmt = db.prepare(sql);
  // 简化处理，直接构造绑定值数组
  const bindValues = [...Object.values(params), ...flatParams, parseInt(limit), offset];
  const items = db.prepare(sql).all(...bindValues);

  res.json({ total, page: parseInt(page), limit: parseInt(limit), items });
});

export default router;
