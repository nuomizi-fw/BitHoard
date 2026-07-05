import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import config from '../config.js';
import { runMigrations } from './migrations.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('db-connection');

let db = null;

/**
 * 获取数据库实例 (单例)
 */
export function getDb() {
  if (db) return db;

  log('Initializing database at:', config.dbPath);

  // 确保 data 目录存在
  const dataDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(config.dbPath);

  // 开启 WAL 模式以支持并发读写
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // 运行迁移
  runMigrations(db);

  log('Database initialized successfully');
  return db;
}

/**
 * 关闭数据库连接
 */
export function closeDb() {
  if (db) {
    log('Closing database connection');
    db.close();
    db = null;
  }
}
