import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/connection.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('file-cache');

/**
 * 清空并重建资源的文件缓存
 * 从已解析的 torrent 数据中提取文件列表写入 file_cache 表
 *
 * @param {string} resourceId - 资源 ID
 * @param {{name: string, totalSize: number, files: Array<{path: string, size: number, index: number}>}} parsedTorrent - torrentParser.parse() 的返回值
 */
export function cacheFilesFromTorrent(resourceId, parsedTorrent) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM file_cache WHERE resource_id = ?').run(resourceId);
    const insert = db.prepare(`
      INSERT INTO file_cache (id, resource_id, file_path, file_size, file_index)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const file of parsedTorrent.files) {
      insert.run(uuidv4(), resourceId, file.path, file.size, file.index);
    }
  })();
}

/**
 * 从 qBittorrent 获取的文件列表重建文件缓存
 *
 * @param {string} resourceId - 资源 ID
 * @param {Array<{name: string, size: number}>} qbFiles - qbClient.getTorrentFiles() 的返回值
 */
export function cacheFilesFromQbittorrent(resourceId, qbFiles) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM file_cache WHERE resource_id = ?').run(resourceId);
    const insert = db.prepare(`
      INSERT INTO file_cache (id, resource_id, file_path, file_size, file_index)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const [i, f] of qbFiles.entries()) {
      insert.run(uuidv4(), resourceId, f.name, f.size, i);
    }
  })();
}
