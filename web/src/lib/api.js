const API_BASE = '/api';

let authToken = localStorage.getItem('bithoard_token') || '';

/**
 * 设置认证 Token
 */
export function setToken(token) {
  authToken = token;
  localStorage.setItem('bithoard_token', token);
}

export function clearToken() {
  authToken = '';
  localStorage.removeItem('bithoard_token');
}

export function getToken() {
  return authToken;
}

/**
 * 通用 API 请求
 */
async function request(endpoint, options = {}) {
  const headers = {
    ...options.headers,
  };

  const isBinary = options.body instanceof Blob ||
                   options.body instanceof ArrayBuffer ||
                   ArrayBuffer.isView(options.body);

  // 不在 GET/HEAD 请求里加 Content-Type
  // 二进制数据（Blob/ArrayBuffer）直接透传，不 JSON 序列化
  if (options.body && !isBinary && !(options.body instanceof FormData) && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Unauthorized');
  }

  return res;
}

/**
 * API 方法
 */
export const api = {
  // Auth
  login: (password) =>
    request('/auth/login', { method: 'POST', body: { password } }).then(r => r.json()),

  checkStatus: () =>
    request('/auth/status').then(r => r.json()),

  qbConfig: () =>
    request('/auth/config').then(r => r.json()),

  updateConfig: (data) =>
    request('/auth/config', { method: 'PUT', body: data }).then(r => r.json()),

  // Resources
  getResources: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/resources?${qs}`).then(r => r.json());
  },

  getResource: (id) =>
    request(`/resources/${id}`).then(r => r.json()),

  createResources: (data) =>
    request('/resources', { method: 'POST', body: data }).then(r => r.json()),

  importTorrent: (data) =>
    request('/resources/import-torrent', { method: 'POST', body: data }).then(r => r.json()),

  updateResource: (id, data) =>
    request(`/resources/${id}`, { method: 'PATCH', body: data }).then(r => r.json()),

  deleteResource: (id) =>
    request(`/resources/${id}`, { method: 'DELETE' }).then(r => r.json()),

  purgeResource: (id) =>
    request(`/resources/${id}/purge`, { method: 'DELETE' }).then(r => r.json()),

  // Screenshots
  getScreenshotUrl: (resourceId, screenshotId, size = 'thumb') => {
    let url = `${API_BASE}/resources/${resourceId}/screenshots/${screenshotId}?size=${size}`;
    if (authToken) url += `&token=${encodeURIComponent(authToken)}`;
    return url;
  },

  uploadScreenshot: (resourceId, imageBlob) =>
    request(`/resources/${resourceId}/screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: imageBlob,
    }).then(r => r.json()),

  deleteScreenshot: (resourceId, screenshotId) =>
    request(`/resources/${resourceId}/screenshots/${screenshotId}`, { method: 'DELETE' }).then(r => r.json()),

  // Torrent
  getTorrentUrl: (resourceId) => {
    let url = `${API_BASE}/resources/${resourceId}/torrent`;
    if (authToken) url += `?token=${encodeURIComponent(authToken)}`;
    return url;
  },

  cacheFiles: (resourceId) =>
    request(`/resources/${resourceId}/cache-files`, { method: 'POST' }).then(r => r.json()),

  tmdbMatch: (resourceId) =>
    request(`/resources/${resourceId}/tmdb-match`, { method: 'POST' }).then(r => r.json()),

  // TMDB
  tmdbSearch: (q, type = 'multi') =>
    request(`/tmdb/search?q=${encodeURIComponent(q)}&type=${type}`).then(r => r.json()),

  tmdbMovie: (movieId) =>
    request(`/tmdb/movie/${movieId}`).then(r => r.json()),

  tmdbTV: (tvId) =>
    request(`/tmdb/tv/${tvId}`).then(r => r.json()),

  // Downloads
  getDownloads: () =>
    request('/downloads').then(r => r.json()),

  createDownload: (data) =>
    request('/downloads', { method: 'POST', body: data }).then(r => r.json()),

  updateDownload: (id, data) =>
    request(`/downloads/${id}`, { method: 'PATCH', body: data }).then(r => r.json()),

  deleteDownload: (id, deleteQbTask = false, deleteFiles = false) =>
    request(`/downloads/${id}`, { method: 'DELETE', body: { delete_qb_task: deleteQbTask, delete_files: deleteFiles } }).then(r => r.json()),

  // Tags
  getTags: () =>
    request('/tags').then(r => r.json()),

  createTag: (name, color) =>
    request('/tags', { method: 'POST', body: { name, color } }).then(r => r.json()),

  deleteTag: (id) =>
    request(`/tags/${id}`, { method: 'DELETE' }).then(r => r.json()),

  updateTag: (id, data) =>
    request(`/tags/${id}`, { method: 'PATCH', body: data }).then(r => r.json()),

  addTagToResource: (resourceId, tagId) =>
    request(`/tags/resources/${resourceId}/tags`, { method: 'POST', body: { tag_id: tagId } }).then(r => r.json()),

  removeTagFromResource: (resourceId, tagId) =>
    request(`/tags/resources/${resourceId}/tags/${tagId}`, { method: 'DELETE' }).then(r => r.json()),

  // Groups
  getGroups: () =>
    request('/groups').then(r => r.json()),

  createGroup: (name, description) =>
    request('/groups', { method: 'POST', body: { name, description } }).then(r => r.json()),

  updateGroup: (id, data) =>
    request(`/groups/${id}`, { method: 'PATCH', body: data }).then(r => r.json()),

  deleteGroup: (id) =>
    request(`/groups/${id}`, { method: 'DELETE' }).then(r => r.json()),

  getGroup: (id) =>
    request(`/groups/${id}`).then(r => r.json()),

  addToGroup: (groupId, resourceId) =>
    request(`/groups/${groupId}/resources/${resourceId}`, { method: 'POST' }).then(r => r.json()),

  removeFromGroup: (groupId, resourceId) =>
    request(`/groups/${groupId}/resources/${resourceId}`, { method: 'DELETE' }).then(r => r.json()),

  // Export/Import
  exportData: (includeScreenshots = true) =>
    `${API_BASE}/export?include_screenshots=${includeScreenshots}`,

  importData: async (file, mode = 'merge') => {
    const res = await fetch(`${API_BASE}/import?mode=${mode}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: file,
    });
    return res.json();
  },

  // Search
  search: (q, type = 'all') =>
    request(`/search?q=${encodeURIComponent(q)}&type=${type}`).then(r => r.json()),

  advancedSearch: (criteria) =>
    request('/search/advanced', { method: 'POST', body: criteria }).then(r => r.json()),

  // qBittorrent
  qbStatus: () =>
    request('/qbittorrent/status').then(r => r.json()),

  qbTorrents: () =>
    request('/qbittorrent/torrents').then(r => r.json()),

  qbTransferInfo: () =>
    request('/qbittorrent/transfer').then(r => r.json()),

  qbPause: (hash) =>
    request(`/qbittorrent/torrents/${hash}/pause`, { method: 'POST' }).then(r => r.json()),

  qbResume: (hash) =>
    request(`/qbittorrent/torrents/${hash}/resume`, { method: 'POST' }).then(r => r.json()),

  qbDelete: (hash, deleteFiles = false) =>
    request(`/qbittorrent/torrents/${hash}`, { method: 'DELETE', body: { deleteFiles } }).then(r => r.json()),

  qbFetchMetadata: (resourceId) =>
    request(`/qbittorrent/fetch-metadata/${resourceId}`, { method: 'POST' }).then(r => r.json()),

  // File Cache
  refreshFileCache: (resourceId) =>
    request(`/resources/${resourceId}/refresh-files`, { method: 'POST' }).then(r => r.json()),
};
