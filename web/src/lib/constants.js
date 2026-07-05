/**
 * 前端共享常量
 */

/** 资源状态中文标签 */
export const STATUS_LABELS = {
  draft: '待完善',
  active: '已入库',
  downloaded: '已下载',
  deleted: '已删除',
};

/** 资源分类 key 列表（与后端 category 字段对齐） */
export const CATEGORY_OPTIONS = ['', 'movie', 'tv', 'anime', 'music', 'game', 'software', 'book', 'other'];

/** 资源分类中文标签 */
export const CATEGORY_LABELS = {
  '': '未分类',
  movie: '电影',
  tv: '电视剧',
  anime: '动画',
  music: '音乐',
  game: '游戏',
  software: '软件',
  book: '书籍',
  other: '其他',
};

/** 来源应用选项（用于筛选下拉） */
export const SOURCE_APP_OPTIONS = ['微信', 'QQ', 'Chrome', 'Edge', 'Firefox', '浏览器', '未知'];

/** 默认标签颜色 */
export const DEFAULT_TAG_COLOR = '#6366f1';

/** 标签配色盘 */
export const TAG_COLOR_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#f43f5e', '#14b8a6', '#64748b', '#6b7280', '#78716c',
];
