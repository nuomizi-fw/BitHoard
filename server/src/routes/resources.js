import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/connection.js';
import writeQueue from '../database/write-queue.js';
import sharp from 'sharp';
import torrentParser from '../services/torrent-parser.js';
import tmdbService from '../services/tmdb.js';

const router = Router();

/**
 * 从磁链中提取显示名称
 */
function extractMagnetName(uri) {
  const match = uri.match(/[?&]dn=([^&]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\+/g, ' ');
  } catch {
    return match[1].replace(/\+/g, ' ');
  }
}

/**
 * 获取资源列表
 * GET /api/resources
 */
router.get('/', (req, res) => {
  const db = getDb();
  const {
    status, category, rating_min, rating_max,
    is_deleted, search, tag, group,
    sort = 'created_at', order = 'desc',
    page = 1, limit = 50,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions = [];
  const params = {};

  if (status) {
    conditions.push('r.status = @status');
    params.status = status;
  }
  if (category) {
    conditions.push('r.category = @category');
    params.category = category;
  }
  if (rating_min) {
    conditions.push('r.rating >= @rating_min');
    params.rating_min = parseInt(rating_min);
  }
  if (rating_max) {
    conditions.push('r.rating <= @rating_max');
    params.rating_max = parseInt(rating_max);
  }
  if (is_deleted !== undefined) {
    conditions.push('r.is_deleted = @is_deleted');
    params.is_deleted = parseInt(is_deleted);
  }
  if (search) {
    conditions.push('(r.title LIKE @search OR r.description LIKE @search OR r.magnet_uri LIKE @search)');
    params.search = `%${search}%`;
  }
  if (tag) {
    conditions.push('r.id IN (SELECT resource_id FROM resource_tag WHERE tag_id = @tag)');
    params.tag = tag;
  }
  if (group) {
    conditions.push('r.id IN (SELECT resource_id FROM resource_group WHERE group_id = @group)');
    params.group = group;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countSql = `SELECT COUNT(*) as total FROM resource r ${whereClause}`;
  const { total } = db.prepare(countSql).get(params);

  const sql = `
    SELECT r.*,
      (SELECT COUNT(*) FROM screenshot WHERE resource_id = r.id) as screenshot_count
    FROM resource r
    ${whereClause}
    ORDER BY r.${sort} ${sortOrder}
    LIMIT @limit OFFSET @offset
  `;
  const resources = db.prepare(sql).all({ ...params, limit: parseInt(limit), offset });

  res.json({
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    items: resources,
  });
});

/**
 * 获取单个资源详情
 * GET /api/resources/:id
 */
router.get('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const resource = db.prepare('SELECT * FROM resource WHERE id = ?').get(id);
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  // 关联数据
  const screenshots = db.prepare('SELECT id, width, height, format, "order", created_at FROM screenshot WHERE resource_id = ? ORDER BY "order"').all(id);
  const files = db.prepare('SELECT * FROM file_cache WHERE resource_id = ? ORDER BY file_index').all(id);
  const tags = db.prepare(`
    SELECT t.* FROM tag t
    JOIN resource_tag rt ON t.id = rt.tag_id
    WHERE rt.resource_id = ?
  `).all(id);
  const groups = db.prepare(`
    SELECT g.* FROM "group" g
    JOIN resource_group rg ON g.id = rg.group_id
    WHERE rg.resource_id = ?
  `).all(id);
  const download = db.prepare('SELECT * FROM download WHERE resource_id = ?').get(id);

  // 不返回大 BLOB 在列表，这里可以加参数控制
  res.json({
    ...resource,
    torrent_blob: undefined, // 大字段按需获取
    screenshots,
    files,
    tags,
    groups,
    download,
  });
});

/**
 * 获取资源截图
 * GET /api/resources/:id/screenshots/:screenshotId?size=thumb|original
 */
router.get('/:id/screenshots/:screenshotId', (req, res) => {
  const db = getDb();
  const { id, screenshotId } = req.params;
  const { size = 'thumb' } = req.query;

  const screenshot = db.prepare(
    'SELECT * FROM screenshot WHERE id = ? AND resource_id = ?'
  ).get(screenshotId, id);

  if (!screenshot) {
    return res.status(404).json({ error: 'Screenshot not found' });
  }

  const data = size === 'original' ? screenshot.image : (screenshot.thumbnail || screenshot.image);
  const contentType = screenshot.format === 'png' ? 'image/png' : 'image/jpeg';

  res.set('Content-Type', contentType);
  res.set('Cache-Control', 'max-age=3600');
  res.send(data);
});

/**
 * 获取 .torrent 文件
 * GET /api/resources/:id/torrent
 */
router.get('/:id/torrent', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const resource = db.prepare('SELECT torrent_blob, magnet_uri FROM resource WHERE id = ?').get(id);
  if (!resource || !resource.torrent_blob) {
    return res.status(404).json({ error: 'Torrent file not cached' });
  }

  // 尝试从标题获取文件名
  const title = resource.magnet_uri.match(/dn=([^&]+)/)?.[1] || 'torrent';
  const filename = decodeURIComponent(title).replace(/[/\\?*:|"<>]/g, '_') + '.torrent';

  res.set('Content-Type', 'application/x-bittorrent');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(resource.torrent_blob);
});

/**
 * 创建资源
 * POST /api/resources
 */
router.post('/', async (req, res) => {
  const { links, sourceApp, sourceProcess } = req.body;

  if (!links || !Array.isArray(links)) {
    return res.status(400).json({ error: 'Links array required' });
  }

  const db = getDb();
  const results = [];

  for (const link of links) {
    // 去重检查
    const existing = db.prepare('SELECT id FROM resource WHERE magnet_uri = ? AND is_deleted = 0').get(link.uri);
    if (existing) {
      results.push({ id: existing.id, uri: link.uri, skipped: true, reason: 'duplicate' });
      continue;
    }

    const id = uuidv4();
    const title = extractMagnetName(link.uri) || '未命名资源';
    await writeQueue.enqueue(() => {
      db.prepare(`
        INSERT INTO resource (id, magnet_uri, title, source_app, source_process, status)
        VALUES (?, ?, ?, ?, ?, 'draft')
      `).run(id, link.uri, title, sourceApp || 'unknown', sourceProcess || '');
    });

    results.push({ id, uri: link.uri, created: true });
  }

  res.status(201).json({ results });
});

/**
 * 更新资源
 * PATCH /api/resources/:id
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const resource = db.prepare('SELECT * FROM resource WHERE id = ?').get(id);
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  const allowedFields = ['title', 'description', 'category', 'status', 'rating', 'review', 'is_deleted'];
  const updates = {};
  const setClauses = [];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
      setClauses.push(`${field} = @${field}`);
    }
  }

  if (setClauses.length === 0) {
    return res.json(resource);
  }

  setClauses.push('updated_at = datetime(\'now\')');
  updates.id = id;

  await writeQueue.enqueue(() => {
    db.prepare(`UPDATE resource SET ${setClauses.join(', ')} WHERE id = @id`).run(updates);
  });

  // 记录日志
  await writeQueue.enqueue(() => {
    db.prepare(`
      INSERT INTO history (id, resource_id, action, detail)
      VALUES (?, ?, 'updated', ?)
    `).run(uuidv4(), id, JSON.stringify(Object.keys(updates).filter(k => k !== 'id')));
  });

  const updated = db.prepare('SELECT * FROM resource WHERE id = ?').get(id);
  res.json(updated);
});

/**
 * 删除资源 (软删除)
 * DELETE /api/resources/:id
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const resource = db.prepare('SELECT * FROM resource WHERE id = ?').get(id);
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  await writeQueue.enqueue(() => {
    db.prepare('UPDATE resource SET is_deleted = 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
  });

  await writeQueue.enqueue(() => {
    db.prepare(`
      INSERT INTO history (id, resource_id, action, detail)
      VALUES (?, ?, 'deleted', ?)
    `).run(uuidv4(), id, '{}');
  });

  res.json({ success: true });
});

/**
 * 彻底删除资源 (硬删除)
 * DELETE /api/resources/:id/purge
 */
router.delete('/:id/purge', async (req, res) => {
  const { id } = req.params;

  await writeQueue.enqueue(() => {
    const db = getDb();
    db.prepare('DELETE FROM resource WHERE id = ?').run(id);
  });

  res.json({ success: true });
});

/**
 * 添加截图
 * POST /api/resources/:id/screenshots
 * Content-Type: image/png 或 image/jpeg (原始二进制)
 */
router.post('/:id/screenshots', async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const resource = db.prepare('SELECT id FROM resource WHERE id = ?').get(id);
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  // 接收原始图片二进制
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const imageBuffer = Buffer.concat(chunks);

      // 生成缩略图
      let thumbnail = null;
      let width = 0;
      let height = 0;
      let format = 'jpeg';

      try {
        const metadata = await sharp(imageBuffer).metadata();
        width = metadata.width || 0;
        height = metadata.height || 0;

        thumbnail = await sharp(imageBuffer)
          .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();

        format = metadata.format === 'png' ? 'png' : 'jpeg';
      } catch (err) {
        console.error('[screenshot] Thumbnail generation error:', err.message);
        // 如果 sharp 失败，用原图当缩略图
        thumbnail = imageBuffer;
      }

      const screenshotId = uuidv4();
      const orderResult = db.prepare(
        'SELECT MAX("order") as max_order FROM screenshot WHERE resource_id = ?'
      ).get(id);
      const order = (orderResult?.max_order ?? -1) + 1;

      await writeQueue.enqueue(() => {
        db.prepare(`
          INSERT INTO screenshot (id, resource_id, image, thumbnail, "order", width, height, format)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(screenshotId, id, imageBuffer, thumbnail, order, width, height, format);
      });

      // 如果是第一条记录，自动提升状态
      if (resource.status === 'draft') {
        await writeQueue.enqueue(() => {
          db.prepare('UPDATE resource SET status = \'active\', updated_at = datetime(\'now\') WHERE id = ?').run(id);
        });
      }

      res.status(201).json({
        id: screenshotId,
        width,
        height,
        format,
        order,
      });
    } catch (err) {
      console.error('[screenshot] Upload error:', err.message);
      res.status(500).json({ error: 'Failed to process image' });
    }
  });
});

/**
 * 删除截图
 * DELETE /api/resources/:id/screenshots/:screenshotId
 */
router.delete('/:id/screenshots/:screenshotId', async (req, res) => {
  const { id, screenshotId } = req.params;

  await writeQueue.enqueue(() => {
    const db = getDb();
    db.prepare('DELETE FROM screenshot WHERE id = ? AND resource_id = ?').run(screenshotId, id);
  });

  res.json({ success: true });
});

/**
 * 缓存种子文件列表
 * POST /api/resources/:id/cache-files
 */
router.post('/:id/cache-files', (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const resource = db.prepare('SELECT torrent_blob FROM resource WHERE id = ?').get(id);
  if (!resource || !resource.torrent_blob) {
    return res.status(400).json({ error: 'No cached torrent file' });
  }

  const parsed = torrentParser.parse(resource.torrent_blob);
  if (!parsed) {
    return res.status(400).json({ error: 'Failed to parse torrent' });
  }

  // 清除旧缓存，写入新数据
  db.transaction(() => {
    db.prepare('DELETE FROM file_cache WHERE resource_id = ?').run(id);
    const insert = db.prepare(`
      INSERT INTO file_cache (id, resource_id, file_path, file_size, file_index)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const file of parsed.files) {
      insert.run(uuidv4(), id, file.path, file.size, file.index);
    }
  })();

  res.json({
    name: parsed.name,
    totalSize: parsed.totalSize,
    fileCount: parsed.files.length,
    files: parsed.files,
  });
});

/**
 * TMDB 自动匹配
 * POST /api/resources/:id/tmdb-match
 */
router.post('/:id/tmdb-match', async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const resource = db.prepare('SELECT * FROM resource WHERE id = ?').get(id);
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  // 使用标题或从磁链提取名称
  const title = resource.title || extractTitleFromMagnet(resource.magnet_uri);
  if (!title) {
    return res.status(400).json({ error: 'No title to search' });
  }

  const match = await tmdbService.autoMatch(title);
  if (!match) {
    return res.status(404).json({ error: 'No TMDB match found' });
  }

  res.json(match);
});

/**
 * 从磁链中提取标题
 */
function extractTitleFromMagnet(uri) {
  const match = uri.match(/dn=([^&]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/[+]/g, ' ');
  } catch {
    return match[1];
  }
}

export default router;
