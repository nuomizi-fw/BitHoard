import { getDb } from './connection.js';
import writeQueue from './write-queue.js';

/**
 * 数据库写操作便捷工具
 *
 * 将 writeQueue.enqueue(() => getDb().prepare(sql).run(...)) 收敛为一行调用，
 * 消除散落在各路由中的重复模式。
 */

/**
 * 执行单个写操作（INSERT/UPDATE/DELETE）
 * @param {string} sql - SQL 语句
 * @param {...any} params - 参数值
 * @returns {Promise<any>} statement.run() 的返回值
 */
export function dbWrite(sql, ...params) {
  return writeQueue.enqueue(() => {
    return getDb().prepare(sql).run(...params);
  });
}

/**
 * 在写队列中执行事务
 * @param {(db: import('better-sqlite3').Database) => void} fn - 事务函数
 * @returns {Promise<void>}
 */
export function dbWriteTransaction(fn) {
  return writeQueue.enqueue(() => {
    const db = getDb();
    db.transaction(() => fn(db))();
  });
}

/**
 * 通用 PATCH 动态更新（用于 tags/groups 等表的 PATCH 路由）
 *
 * @param {string} table - 表名
 * @param {string} idColumn - ID 列名
 * @param {string} id - 记录 ID
 * @param {object} body - 请求体
 * @param {string[]} allowedFields - 允许更新的字段
 * @returns {Promise<{setClauses: string[], updates: object}>}
 */
export async function dbPatch(table, idColumn, id, body, allowedFields) {
  const db = getDb();
  const record = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?`).get(id);
  if (!record) return { notFound: true, record: null };

  const setClauses = [];
  const updates = { id };

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      setClauses.push(`${field} = @${field}`);
      updates[field] = body[field];
    }
  }

  if (setClauses.length > 0) {
    setClauses.push("updated_at = datetime('now')");
    await writeQueue.enqueue(() => {
      db.prepare(`UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${idColumn} = @id`).run(updates);
    });
  }

  const updated = db.prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?`).get(id);
  return { notFound: false, record: updated };
}

/**
 * 通用软删除
 * @param {string} table - 表名
 * @param {string} idColumn - ID 列名
 * @param {string} id - 记录 ID
 */
export async function dbSoftDelete(table, idColumn, id) {
  return dbWrite(
    `UPDATE ${table} SET is_deleted = 1, updated_at = datetime('now') WHERE ${idColumn} = ?`,
    id
  );
}

/**
 * 通用硬删除
 * @param {string} table - 表名
 * @param {string} idColumn - ID 列名
 * @param {string} id - 记录 ID
 */
export async function dbHardDelete(table, idColumn, id) {
  return dbWrite(`DELETE FROM ${table} WHERE ${idColumn} = ?`, id);
}
