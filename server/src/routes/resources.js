import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/connection.js';
import { dbWrite } from '../database/helpers.js';
import sharp from 'sharp';
import torrentParser from '../services/torrent-parser.js';
import tmdbService from '../services/tmdb.js';
import { extractCandidateTitle, extractDnName, extractContextSnippet } from '../services/title-extractor.js';
import { buildResourceWhereClause, buildOrderClause, SCREENSHOT_SUBQUERY, VIDEO_SUBQUERY } from '../lib/query-builder.js';

import { cacheFilesFromTorrent } from '../services/file-cache.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routes-resources');

const router = Router();

/**
 * 从磁链中提取显示名称（复用 title-extractor）
 */
function extractMagnetName(uri) {
  return extractDnName(uri);
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
    source_app, has_download,
    sort = 'created_at', order = 'desc',
    page = 1, limit = 50,
  } = req.query;

  const { whereClause, params } = buildResourceWhereClause({
    status, category, rating_min, rating_max,
    is_deleted, search, tag, group,
    source_app, has_download,
  });
  const { safeSort, safeOrder } = buildOrderClause(sort, order);

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const countSql = `SELECT COUNT(*) as total FROM resource r ${whereClause}`;
  const { total } = db.prepare(countSql).get(params);

  const sql = `
    SELECT r.*, ${SCREENSHOT_SUBQUERY}, ${VIDEO_SUBQUERY}
    FROM resource r
    ${whereClause}
    ORDER BY ${safeSort} ${safeOrder}
    LIMIT @limit OFFSET @offset
  `;
  const resources = db.prepare(sql).all({ ...params, limit: parseInt(limit), offset });

  // 批量获取所有资源的标签（避免 N+1 查询）
  const resourceIds = resources.map(r => r.id);
  const tagsMap = {};
  if (resourceIds.length > 0) {
    const placeholders = resourceIds.map(() => '?').join(',');
    const tagRows = db.prepare(`
      SELECT rt.resource_id, t.id, t.name, t.color
      FROM resource_tag rt
      JOIN tag t ON t.id = rt.tag_id
      WHERE rt.resource_id IN (${placeholders})
      ORDER BY rt.resource_id, t.name
    `).all(...resourceIds);
    for (const row of tagRows) {
      if (!tagsMap[row.resource_id]) tagsMap[row.resource_id] = [];
      tagsMap[row.resource_id].push({ id: row.id, name: row.name, color: row.color });
    }
  }

  // 处理 screenshot_ids 字符串为数组；附加 tags
  const items = resources.map(r => ({
    ...r,
    screenshot_ids: r.screenshot_ids ? r.screenshot_ids.split(',') : [],
    tags: tagsMap[r.id] || [],
  }));

  res.json({
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    items,
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
  const videos = db.prepare('SELECT id, file_name, file_size, format, created_at FROM video WHERE resource_id = ? ORDER BY created_at').all(id);
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
    videos,
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
  // 缩略图固定为 JPEG（sharp 生成），原图按存储格式
  const contentType = size === 'original'
    ? (screenshot.format === 'png' ? 'image/png' : 'image/jpeg')
    : 'image/jpeg';

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
 * 导入 .torrent 文件创建资源
 * POST /api/resources/import-torrent
 * Body: { data: base64, name: string, sourceApp?: string }
 */
router.post('/import-torrent', async (req, res) => {
  const { data, name, sourceApp } = req.body;

  if (!data) {
    return res.status(400).json({ error: 'Base64 torrent data required' });
  }

  let torrentBuf;
  try {
    torrentBuf = Buffer.from(data, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 data' });
  }

  const db = getDb();

  // 解析种子文件
  let parsed;
  try {
    parsed = torrentParser.parse(torrentBuf);
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse torrent: ' + err.message });
  }

  if (!parsed || !parsed.infoHash) {
    return res.status(400).json({ error: 'Invalid torrent file: no info hash' });
  }

  const magnetUri = `magnet:?xt=urn:btih:${parsed.infoHash}&dn=${encodeURIComponent(parsed.name || name || 'untitled')}`;

  // 去重
  const existing = db.prepare('SELECT id FROM resource WHERE magnet_uri = ? AND is_deleted = 0').get(magnetUri);
  if (existing) {
    return res.json({ id: existing.id, skipped: true, reason: 'duplicate', uri: magnetUri });
  }

  const id = uuidv4();
  const title = parsed.name || name || '未命名种子';
  const totalSize = parsed.totalSize || 0;

  await dbWrite(
    `INSERT INTO resource (id, magnet_uri, title, torrent_blob, total_size, source_app, raw_context, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
    id, magnetUri, title, torrentBuf, totalSize, sourceApp || 'torrent-drag', ''
  );

  // 缓存文件列表
  if (parsed.files && parsed.files.length > 0) {
    for (const file of parsed.files) {
      await dbWrite(
        'INSERT INTO file_cache (id, resource_id, filename, path, size) VALUES (?, ?, ?, ?, ?)',
        uuidv4(), id, file.name, file.path, file.size
      );
    }
  }

  res.status(201).json({ id, uri: magnetUri, created: true, title });
});

/**
 * 创建资源
 * POST /api/resources
 * Body: { links: [{ uri, type }], sourceApp?, sourceProcess?, contextText?, suggestedTitle? }
 */
router.post('/', async (req, res) => {
  log('POST / START, body keys:', Object.keys(req.body));
  try {
  const { links, sourceApp, sourceProcess, contextText, suggestedTitle } = req.body;
  log('POST / links:', links?.length, 'ctxLen:', contextText?.length || 0, 'suggestedTitle:', (suggestedTitle || '').substring(0, 40));

  if (!links || !Array.isArray(links)) {
    log('POST / BAD_REQUEST: no links');
    return res.status(400).json({ error: 'Links array required' });
  }

  const db = getDb();
  log('POST / db ok, loop over', links.length, 'links');
  const results = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    try {
      const t0 = Date.now();
      log('POST / [' + i + '] dedup: ' + link.uri.substring(0, 60));

      // 先提取标题（无论插入还是复活都需要）
      let title;
      if (link.title && link.title.trim()) {
        title = link.title.trim();
        log('POST / [' + i + '] title=link.title "' + title.substring(0, 30) + '"');
      } else if (suggestedTitle && suggestedTitle.trim()) {
        title = suggestedTitle.trim();
        log('POST / [' + i + '] title=suggestedTitle "' + title.substring(0, 30) + '"');
      } else if (contextText && contextText.trim()) {
        const t1 = Date.now();
        const extracted = extractCandidateTitle(contextText, link.uri);
        title = extracted.suggestedTitle;
        log('POST / [' + i + '] title=context(source=' + extracted.source + ') "' + title.substring(0, 30) + '" (' + (Date.now() - t1) + 'ms)');
      } else {
        title = extractMagnetName(link.uri) || '未命名资源';
        log('POST / [' + i + '] title=fallback "' + title.substring(0, 30) + '"');
      }

      const contextSnippet = contextText ? extractContextSnippet(contextText, link.uri) : '';

      // 去重查全表（magnet_uri 有 UNIQUE 约束，不能只看 is_deleted=0）
      const existing = db.prepare('SELECT id, is_deleted FROM resource WHERE magnet_uri = ?').get(link.uri);
      if (existing) {
        if (existing.is_deleted) {
          // 软删除记录：原地复活，更新标题、来源、上下文
          await dbWrite(
            `UPDATE resource SET is_deleted = 0, status = 'draft',
               title = ?, source_app = ?, source_process = ?, raw_context = ?,
               updated_at = datetime('now')
             WHERE id = ?`,
            title, sourceApp || 'unknown', sourceProcess || '', contextSnippet, existing.id
          );
          log('POST / [' + i + '] REACTIVATED id=' + existing.id + ' (was soft-deleted)');
          results.push({ id: existing.id, uri: link.uri, created: true, suggestedTitle: title, reactivated: true });
        } else {
          log('POST / [' + i + '] SKIP dup id=' + existing.id);
          results.push({ id: existing.id, uri: link.uri, skipped: true, reason: 'duplicate' });
        }
        continue;
      }

      const id = uuidv4();

      log('POST / [' + i + '] dbWrite INSERT...');
      const t3 = Date.now();
      await dbWrite(
        `INSERT INTO resource (id, magnet_uri, title, source_app, source_process, raw_context, status)
         VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
        id, link.uri, title, sourceApp || 'unknown', sourceProcess || '', contextSnippet
      );
      log('POST / [' + i + '] dbWrite done ' + (Date.now() - t3) + 'ms, loop ' + (Date.now() - t0) + 'ms');

      results.push({ id, uri: link.uri, created: true, suggestedTitle: title });
    } catch (err) {
      log('POST / [' + i + '] ERROR:', err.message, err.stack);
      // 单条失败记录错误但不阻塞其他链接，继续处理下一条
      results.push({ uri: link.uri, error: err.message });
    }
  }

  log('POST / ALL DONE, sending', results.length, 'results');
  res.status(201).json({ results });
  log('POST / response sent');
  } catch (err) {
    log('POST / FATAL:', err.message, err.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }
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

  await dbWrite(`UPDATE resource SET ${setClauses.join(', ')} WHERE id = @id`, updates);

  // 记录日志
  await dbWrite(
    `INSERT INTO history (id, resource_id, action, detail) VALUES (?, ?, 'updated', ?)`,
    uuidv4(), id, JSON.stringify(Object.keys(updates).filter(k => k !== 'id'))
  );

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

  await dbWrite("UPDATE resource SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?", id);

  await dbWrite(
    `INSERT INTO history (id, resource_id, action, detail) VALUES (?, ?, 'deleted', ?)`,
    uuidv4(), id, '{}'
  );

  res.json({ success: true });
});

/**
 * 彻底删除资源 (硬删除)
 * DELETE /api/resources/:id/purge
 */
router.delete('/:id/purge', async (req, res) => {
  const { id } = req.params;

  await dbWrite('DELETE FROM resource WHERE id = ?', id);

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
        log('Thumbnail generation error:', err.message);
        // 如果 sharp 失败，用原图当缩略图
        thumbnail = imageBuffer;
      }

      const screenshotId = uuidv4();
      const orderResult = db.prepare(
        'SELECT MAX("order") as max_order FROM screenshot WHERE resource_id = ?'
      ).get(id);
      const order = (orderResult?.max_order ?? -1) + 1;

      await dbWrite(
        `INSERT INTO screenshot (id, resource_id, image, thumbnail, "order", width, height, format)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        screenshotId, id, imageBuffer, thumbnail, order, width, height, format
      );

      // 如果是第一条记录，自动提升状态
      if (resource.status === 'draft') {
        await dbWrite(
          "UPDATE resource SET status = 'active', updated_at = datetime('now') WHERE id = ?",
          id
        );
      }

      res.status(201).json({
        id: screenshotId,
        width,
        height,
        format,
        order,
      });
    } catch (err) {
      log('Screenshot upload error:', err.message);
      res.status(500).json({ error: 'Failed to process image' });
    }
  });
});

/**
 * 添加视频
 * POST /api/resources/:id/videos
 * Content-Type: application/octet-stream (原始二进制)
 * X-File-Name: 原始文件名 (URL 编码)
 */
router.post('/:id/videos', async (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const resource = db.prepare('SELECT id, status FROM resource WHERE id = ?').get(id);
  if (!resource) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  const fileName = decodeURIComponent(req.headers['x-file-name'] || 'video.mp4');

  // 接收原始视频二进制
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const videoBuffer = Buffer.concat(chunks);
      const ext = fileName.split('.').pop()?.toLowerCase() || 'mp4';

      const videoId = uuidv4();

      await dbWrite(
        `INSERT INTO video (id, resource_id, file_name, video, file_size, format)
         VALUES (?, ?, ?, ?, ?, ?)`,
        videoId, id, fileName, videoBuffer, videoBuffer.length, ext
      );

      // 自动提升状态
      if (resource.status === 'draft') {
        await dbWrite(
          "UPDATE resource SET status = 'active', updated_at = datetime('now') WHERE id = ?",
          id
        );
      }

      res.status(201).json({
        id: videoId,
        file_name: fileName,
        file_size: videoBuffer.length,
        format: ext,
      });
    } catch (err) {
      log('Video upload error:', err.message);
      res.status(500).json({ error: 'Failed to store video' });
    }
  });
});

/**
 * 获取视频
 * GET /api/resources/:id/videos/:videoId
 * 支持 Range 请求，方便 <video> 标签 seek
 */
router.get('/:id/videos/:videoId', (req, res) => {
  const db = getDb();
  const { id, videoId } = req.params;

  const video = db.prepare(
    'SELECT * FROM video WHERE id = ? AND resource_id = ?'
  ).get(videoId, id);

  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const videoBuffer = video.video;
  const fileSize = videoBuffer.length;
  const mimeMap = {
    'mp4': 'video/mp4', 'webm': 'video/webm', 'mkv': 'video/x-matroska',
    'avi': 'video/x-msvideo', 'mov': 'video/quicktime', 'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv', 'm4v': 'video/mp4',
  };
  const contentType = mimeMap[video.format] || 'video/mp4';

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = (end - start) + 1;

    res.status(206);
    res.set({
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    res.send(videoBuffer.slice(start, end + 1));
  } else {
    res.set({
      'Content-Type': contentType,
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'max-age=3600',
    });
    res.send(videoBuffer);
  }
});

/**
 * 删除截图
 * DELETE /api/resources/:id/screenshots/:screenshotId
 */
router.delete('/:id/screenshots/:screenshotId', async (req, res) => {
  const { id, screenshotId } = req.params;

  await dbWrite('DELETE FROM screenshot WHERE id = ? AND resource_id = ?', screenshotId, id);

  res.json({ success: true });
});

/**
 * 删除视频
 * DELETE /api/resources/:id/videos/:videoId
 */
router.delete('/:id/videos/:videoId', async (req, res) => {
  const { id, videoId } = req.params;

  await dbWrite('DELETE FROM video WHERE id = ? AND resource_id = ?', videoId, id);

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
  cacheFilesFromTorrent(id, parsed);

  res.json({
    name: parsed.name,
    totalSize: parsed.totalSize,
    fileCount: parsed.files.length,
    files: parsed.files,
  });
});

/**
 * 刷新文件缓存
 * POST /api/resources/:id/refresh-files
 */
router.post('/:id/refresh-files', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const resource = db.prepare('SELECT torrent_blob FROM resource WHERE id = ?').get(id);
  if (!resource || !resource.torrent_blob) {
    return res.status(400).json({ error: 'No cached torrent file to parse' });
  }

  const parsed = torrentParser.parse(resource.torrent_blob);
  if (!parsed) {
    return res.status(400).json({ error: 'Failed to parse torrent' });
  }

  cacheFilesFromTorrent(id, parsed);

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
