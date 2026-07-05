import { ALLOWED_RESOURCE_SORTS } from './constants.js';

/**
 * 资源查询条件构建器
 *
 * 将 resources.js GET / 和 search.js POST /advanced 中重复的条件拼接逻辑
 * 统一抽取到此工具函数。
 */

/**
 * 构建资源 WHERE 子句
 * @param {object} filters - 筛选条件
 * @param {string} [filters.status]
 * @param {string} [filters.category]
 * @param {number|string} [filters.rating_min]
 * @param {number|string} [filters.rating_max]
 * @param {number|string} [filters.is_deleted]
 * @param {string} [filters.search] - 关键词搜索
 * @param {string} [filters.tag] - 标签 ID
 * @param {string} [filters.group] - 分组 ID
 * @param {string} [filters.source_app]
 * @param {string} [filters.has_download]
 * @param {string} [filters.alias] - 表别名，默认 'r'
 * @returns {{ whereClause: string, params: object }}
 */
export function buildResourceWhereClause(filters = {}, alias = 'r') {
  const conditions = [];
  const params = {};

  if (filters.status) {
    conditions.push(`${alias}.status = @status`);
    params.status = filters.status;
  }
  if (filters.category) {
    conditions.push(`${alias}.category = @category`);
    params.category = filters.category;
  }
  if (filters.rating_min !== undefined) {
    conditions.push(`${alias}.rating >= @rating_min`);
    params.rating_min = parseInt(filters.rating_min);
  }
  if (filters.rating_max !== undefined) {
    conditions.push(`${alias}.rating <= @rating_max`);
    params.rating_max = parseInt(filters.rating_max);
  }
  if (filters.is_deleted !== undefined) {
    conditions.push(`${alias}.is_deleted = @is_deleted`);
    params.is_deleted = parseInt(filters.is_deleted);
  }
  if (filters.search) {
    conditions.push(`(${alias}.title LIKE @search OR ${alias}.description LIKE @search OR ${alias}.magnet_uri LIKE @search)`);
    params.search = `%${filters.search}%`;
  }
  if (filters.tag) {
    conditions.push(`${alias}.id IN (SELECT resource_id FROM resource_tag WHERE tag_id = @tag)`);
    params.tag = filters.tag;
  }
  if (filters.group) {
    conditions.push(`${alias}.id IN (SELECT resource_id FROM resource_group WHERE group_id = @group)`);
    params.group = filters.group;
  }
  if (filters.source_app) {
    conditions.push(`${alias}.source_app = @source_app`);
    params.source_app = filters.source_app;
  }
  if (filters.has_download === '1') {
    conditions.push(`${alias}.id IN (SELECT resource_id FROM download)`);
  }
  if (filters.has_download === '0') {
    conditions.push(`${alias}.id NOT IN (SELECT resource_id FROM download)`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

/**
 * 构建排序子句（白名单校验）
 * @param {string} sort - 排序字段
 * @param {string} order - 排序方向 ('asc'|'desc')
 * @param {string} [alias] - 表别名
 * @returns {{ safeSort: string, safeOrder: string }}
 */
export function buildOrderClause(sort = 'created_at', order = 'desc', alias = 'r') {
  const safeSort = ALLOWED_RESOURCE_SORTS.includes(sort) ? `${alias}.${sort}` : `${alias}.created_at`;
  const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return { safeSort, safeOrder };
}

/**
 * 构建常用的 screenshot 子查询片段
 * @param {string} [alias] - 表别名
 */
export const SCREENSHOT_SUBQUERY = `
  (SELECT COUNT(*) FROM screenshot WHERE resource_id = r.id) as screenshot_count,
  (SELECT id FROM screenshot WHERE resource_id = r.id ORDER BY "order" LIMIT 1) as first_screenshot_id
`;
