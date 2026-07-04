import { Router } from 'express';
import { getDb } from '../database/connection.js';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

/**
 * 导出整个数据库
 * GET /api/export
 * Query: ?include_screenshots=true|false
 */
router.get('/', (req, res) => {
  const { include_screenshots = 'true' } = req.query;

  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');

  const dbPath = db.name;
  const tmpDir = os.tmpdir();
  const exportFileName = `bithoard-export-${Date.now()}.bithoard`;
  const exportPath = path.join(tmpDir, exportFileName);

  try {
    // 先复制整个数据库文件
    fs.copyFileSync(dbPath, exportPath);

    // 如果不包含截图，在副本中清空 screenshot 表
    if (include_screenshots !== 'true') {
      const BetterSQLite3 = require('better-sqlite3');
      const copyDb = new BetterSQLite3(exportPath);
      copyDb.pragma('journal_mode = DELETE');
      copyDb.prepare('DELETE FROM screenshot').run();
      copyDb.pragma('vacuum');
      copyDb.close();
    }

    const stat = fs.statSync(exportPath);
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', `attachment; filename="${exportFileName}"`);
    res.set('Content-Length', stat.size);

    const stream = fs.createReadStream(exportPath);
    stream.pipe(res);
    stream.on('close', () => {
      fs.unlink(exportPath, () => {});
    });
    stream.on('error', () => {
      fs.unlink(exportPath, () => {});
    });
  } catch (err) {
    console.error('[export] Error:', err.message);
    if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath);
    res.status(500).json({ error: 'Export failed', message: err.message });
  }
});

/**
 * 导入 .bithoard 文件
 * POST /api/import
 * Content-Type: application/octet-stream
 * Query: ?mode=merge|replace (默认 merge)
 */
router.post('/', (req, res) => {
  const { mode = 'merge' } = req.query;
  const chunks = [];

  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const tmpDir = os.tmpdir();
    const importPath = path.join(tmpDir, `bithoard-import-${Date.now()}.db`);
    let importDb = null;

    try {
      fs.writeFileSync(importPath, buffer);

      const BetterSQLite3 = require('better-sqlite3');
      importDb = new BetterSQLite3(importPath);

      const db = getDb();

      if (mode === 'replace') {
        db.exec('DELETE FROM history');
        db.exec('DELETE FROM screenshot');
        db.exec('DELETE FROM resource_tag');
        db.exec('DELETE FROM resource_group');
        db.exec('DELETE FROM tag');
        db.exec('DELETE FROM "group"');
        db.exec('DELETE FROM download');
        db.exec('DELETE FROM file_cache');
        db.exec('DELETE FROM resource');
      }

      const tables = ['resource', 'tag', '"group"', 'screenshot', 'file_cache', 'download', 'history'];
      for (const table of tables) {
        let rows;
        try { rows = importDb.prepare(`SELECT * FROM ${table}`).all(); } catch { continue; }
        if (!rows || rows.length === 0) continue;

        const cols = Object.keys(rows[0]).join(', ');
        const placeholders = Object.keys(rows[0]).map(() => '?').join(', ');
        const insert = db.prepare(`INSERT OR ${mode === 'replace' ? 'REPLACE' : 'IGNORE'} INTO ${table} (${cols}) VALUES (${placeholders})`);

        db.transaction(() => {
          for (const row of rows) insert.run(...Object.values(row));
        })();
      }

      const relationalTables = ['resource_tag', 'resource_group'];
      for (const table of relationalTables) {
        let rows;
        try { rows = importDb.prepare(`SELECT * FROM ${table}`).all(); } catch { continue; }
        if (!rows || rows.length === 0) continue;

        const cols = Object.keys(rows[0]).join(', ');
        const placeholders = Object.keys(rows[0]).map(() => '?').join(', ');
        const insert = db.prepare(`INSERT OR IGNORE INTO ${table} (${cols}) VALUES (${placeholders})`);

        db.transaction(() => {
          for (const row of rows) insert.run(...Object.values(row));
        })();
      }

      importDb.close();
      importDb = null;
      fs.unlinkSync(importPath);

      res.json({ success: true, mode });
    } catch (err) {
      console.error('[import] Error:', err.message);
      if (importDb) { try { importDb.close(); } catch {} }
      try { if (fs.existsSync(importPath)) fs.unlinkSync(importPath); } catch {}
      res.status(500).json({ error: 'Import failed', message: err.message });
    }
  });

  req.on('error', () => {
    res.status(400).json({ error: 'Upload interrupted' });
  });
});

export default router;
