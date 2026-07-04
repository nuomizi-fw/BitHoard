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

  // 不在 GET/HEAD 请求里加 Content-Type
  if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
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

  // Resources
  getResources: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/resources?${qs}`).then(r => r.json());
  },

  getResource: (id) =>
    request(`/resources/${id}`).then(r => r.json()),

  createResources: (data) =>
    request('/resources', { method: 'POST', body: data }).then(r => r.json()),

  updateResource: (id, data) =>
    request(`/resources/${id}`, { method: 'PATCH', body: data }).then(r => r.json()),

  deleteResource: (id) =>
    request(`/resources/${id}`, { method: 'DELETE' }).then(r => r.json()),

  purgeResource: (id) =>
    request(`/resources/${id}/purge`, { method: 'DELETE' }).then(r => r.json()),

  // Screenshots
  getScreenshotUrl: (resourceId, screenshotId, size = 'thumb') =>
    `${API_BASE}/resources/${resourceId}/screenshots/${screenshotId}?size=${size}`,

  uploadScreenshot: (resourceId, imageBlob) =>
    request(`/resources/${resourceId}/screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: imageBlob,
    }).then(r => r.json()),

  deleteScreenshot: (resourceId, screenshotId) =>
    request(`/resources/${resourceId}/screenshots/${screenshotId}`, { method: 'DELETE' }).then(r => r.json()),

  // Torrent
  getTorrentUrl: (resourceId) =>
    `${API_BASE}/resources/${resourceId}/torrent`,

  cacheFiles: (resourceId) =>
    request(`/resources/${resourceId}/cache-files`, { method: 'POST' }).then(r => r.json()),

  tmdbMatch: (resourceId) =>
    request(`/resources/${resourceId}/tmdb-match`, { method: 'POST' }).then(r => r.json()),

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

  addTagToResource: (resourceId, tagId) =>
    request(`/tags/resources/${resourceId}/tags`, { method: 'POST', body: { tag_id: tagId } }).then(r => r.json()),

  removeTagFromResource: (resourceId, tagId) =>
    request(`/tags/resources/${resourceId}/tags/${tagId}`, { method: 'DELETE' }).then(r => r.json()),

  // Groups
  getGroups: () =>
    request('/groups').then(r => r.json()),

  createGroup: (name, description) =>
    request('/groups', { method: 'POST', body: { name, description } }).then(r => r.json()),

  addToGroup: (groupId, resourceId) =>
    request(`/groups/${groupId}/resources/${resourceId}`, { method: 'POST' }).then(r => r.json()),

  removeFromGroup: (groupId, resourceId) =>
    request(`/groups/${groupId}/resources/${resourceId}`, { method: 'DELETE' }).then(r => r.json()),

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
};
