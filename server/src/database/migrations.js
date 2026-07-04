/**
 * 数据库迁移脚本
 * 按版本号依次执行，使用 user_version PRAGMA 跟踪当前版本
 */
const migrations = [
  {
    version: 1,
    description: 'Initial schema',
    sql: `
      -- 资源主表 (轻量，只含内容信息)
      CREATE TABLE IF NOT EXISTS resource (
        id TEXT PRIMARY KEY,
        magnet_uri TEXT NOT NULL,
        torrent_blob BLOB,
        title TEXT,
        description TEXT,
        source_app TEXT DEFAULT 'unknown',
        source_process TEXT DEFAULT '',
        category TEXT DEFAULT 'other',
        status TEXT NOT NULL DEFAULT 'draft',
        rating INTEGER DEFAULT 0,
        review TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_resource_status ON resource(status);
      CREATE INDEX idx_resource_category ON resource(category);
      CREATE INDEX idx_resource_rating ON resource(rating);
      CREATE INDEX idx_resource_is_deleted ON resource(is_deleted);
      CREATE INDEX idx_resource_created_at ON resource(created_at);
      CREATE INDEX idx_resource_magnet_uri ON resource(magnet_uri);

      -- 截图子表
      CREATE TABLE IF NOT EXISTS screenshot (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        image BLOB NOT NULL,
        thumbnail BLOB,
        "order" INTEGER DEFAULT 0,
        width INTEGER,
        height INTEGER,
        format TEXT DEFAULT 'jpeg',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (resource_id) REFERENCES resource(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_screenshot_resource ON screenshot(resource_id);

      -- 种子内文件列表缓存
      CREATE TABLE IF NOT EXISTS file_cache (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_index INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (resource_id) REFERENCES resource(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_file_cache_resource ON file_cache(resource_id);
      CREATE INDEX idx_file_cache_path ON file_cache(file_path);

      -- 下载记录 (可选，一个资源最多一条)
      CREATE TABLE IF NOT EXISTS download (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL UNIQUE,
        download_path TEXT,
        download_status TEXT NOT NULL DEFAULT 'pending',
        qb_task_hash TEXT,
        total_size INTEGER DEFAULT 0,
        downloaded_size INTEGER DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (resource_id) REFERENCES resource(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_download_resource ON download(resource_id);
      CREATE INDEX idx_download_status ON download(download_status);

      -- 标签
      CREATE TABLE IF NOT EXISTS tag (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#6366f1',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- 资源-标签 关联
      CREATE TABLE IF NOT EXISTS resource_tag (
        resource_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (resource_id, tag_id),
        FOREIGN KEY (resource_id) REFERENCES resource(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
      );

      -- 分组 (扁平容器)
      CREATE TABLE IF NOT EXISTS "group" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        cover BLOB,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- 资源-分组 关联
      CREATE TABLE IF NOT EXISTS resource_group (
        resource_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        PRIMARY KEY (resource_id, group_id),
        FOREIGN KEY (resource_id) REFERENCES resource(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES "group"(id) ON DELETE CASCADE
      );

      -- 操作日志
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        resource_id TEXT,
        action TEXT NOT NULL,
        detail TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (resource_id) REFERENCES resource(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_history_resource ON history(resource_id);
      CREATE INDEX idx_history_action ON history(action);
      CREATE INDEX idx_history_created_at ON history(created_at);
    `,
  },
  {
    version: 2,
    description: 'Add constraints & fix defaults on resource table',
    sql: `
      -- 重建 resource 表以添加 CHECK/UNIQUE 约束
      CREATE TABLE resource_new (
        id TEXT PRIMARY KEY,
        magnet_uri TEXT NOT NULL UNIQUE,
        torrent_blob BLOB,
        title TEXT DEFAULT '',
        description TEXT DEFAULT '',
        source_app TEXT DEFAULT '未知',
        source_process TEXT DEFAULT '',
        category TEXT DEFAULT '其他',
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active')),
        rating INTEGER DEFAULT 0 CHECK(rating >= 0 AND rating <= 5),
        review TEXT DEFAULT '',
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO resource_new SELECT * FROM resource;

      DROP TABLE resource;
      ALTER TABLE resource_new RENAME TO resource;

      -- 重建索引
      CREATE INDEX idx_resource_status ON resource(status);
      CREATE INDEX idx_resource_category ON resource(category);
      CREATE INDEX idx_resource_rating ON resource(rating);
      CREATE INDEX idx_resource_is_deleted ON resource(is_deleted);
      CREATE INDEX idx_resource_created_at ON resource(created_at);
      CREATE UNIQUE INDEX idx_resource_magnet_uri ON resource(magnet_uri);

      -- 同步更新 v1 的默认值以保持外键引用兼容
      UPDATE resource SET source_app = '未知' WHERE source_app = 'unknown';
      UPDATE resource SET category = '其他' WHERE category = 'other';
      UPDATE resource SET review = '' WHERE review IS NULL;
      UPDATE resource SET title = '' WHERE title IS NULL;
      UPDATE resource SET description = '' WHERE description IS NULL;
    `,
  },
];

export function runMigrations(db) {
  // 获取当前版本
  const currentVersion = db.pragma('user_version', { simple: true });

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`[db] Running migration v${migration.version}: ${migration.description}`);

      // 在事务中执行
      db.transaction(() => {
        db.exec(migration.sql);
        db.pragma(`user_version = ${migration.version}`);
      })();

      console.log(`[db] Migration v${migration.version} complete`);
    }
  }
}
