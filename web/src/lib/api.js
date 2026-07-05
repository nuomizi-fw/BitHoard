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
    console.log('[api] request body json-stringified, len=', options.body.length);
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const url = `${API_BASE}${endpoint}`;
  const method = options.method || 'GET';
  console.log('[api] fetch START', method, url, 'bodyLen=', options.body?.length || 0);

  // 30s 超时，防止服务端无响应时 fetch 永久挂起
  const abortCtrl = new AbortController();
  const timeoutId = setTimeout(() => abortCtrl.abort(), 30_000);

  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, { ...options, headers, signal: abortCtrl.signal });
    clearTimeout(timeoutId);
    console.log('[api] fetch DONE', res.status, 'in', (performance.now() - t0).toFixed(0), 'ms');
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('[api] fetch TIMEOUT after 30s for', method, url);
      throw new Error(`请求超时: ${method} ${url} (30s)`);
    }
    console.error('[api] fetch ERROR', method, url, ':', err.message);
    throw err;
  }

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Unauthorized');
  }

  return res;
}

/**
 * 通用 API JSON 请求（自动 parse JSON，消除 .then(r => r.json()) 重复）
 */
async function requestJson(endpoint, options = {}) {
  const res = await request(endpoint, options);
  console.log(`[api] requestJson ${endpoint} status=${res.status}`);
  const json = await res.json();
  console.log(`[api] requestJson ${endpoint} json parsed ok`);
  return json;
}

/**
 * API 方法
 */
export const api = {
  // Auth
  login: (password) =>
    requestJson('/auth/login', { method: 'POST', body: { password } }),

  checkStatus: () =>
    requestJson('/auth/status'),

  qbConfig: () =>
    requestJson('/auth/config'),

  updateConfig: (data) =>
    requestJson('/auth/config', { method: 'PUT', body: data }),

  // Resources
  getResources: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return requestJson(`/resources?${qs}`);
  },

  getResource: (id) =>
    requestJson(`/resources/${id}`),

  createResources: (data) => {
    console.log('[api] createResources START, links=', data.links?.length, 'ctxLen=', data.contextText?.length || 0);
    const t0 = performance.now();
    return requestJson('/resources', { method: 'POST', body: data }).then(r => {
      console.log('[api] createResources DONE in', (performance.now() - t0).toFixed(0), 'ms, results=', r.results?.length);
      return r;
    }).catch(err => {
      console.error('[api] createResources FAILED:', err.message);
      throw err;
    });
  },

  importTorrent: (data) =>
    requestJson('/resources/import-torrent', { method: 'POST', body: data }),

  updateResource: (id, data) =>
    requestJson(`/resources/${id}`, { method: 'PATCH', body: data }),

  deleteResource: (id) =>
    requestJson(`/resources/${id}`, { method: 'DELETE' }),

  purgeResource: (id) =>
    requestJson(`/resources/${id}/purge`, { method: 'DELETE' }),

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
    requestJson(`/resources/${resourceId}/screenshots/${screenshotId}`, { method: 'DELETE' }),

  // Torrent
  getTorrentUrl: (resourceId) => {
    let url = `${API_BASE}/resources/${resourceId}/torrent`;
    if (authToken) url += `?token=${encodeURIComponent(authToken)}`;
    return url;
  },

  cacheFiles: (resourceId) =>
    requestJson(`/resources/${resourceId}/cache-files`, { method: 'POST' }),

  tmdbMatch: (resourceId) =>
    requestJson(`/resources/${resourceId}/tmdb-match`, { method: 'POST' }),

  // TMDB
  tmdbSearch: (q, type = 'multi') =>
    requestJson(`/tmdb/search?q=${encodeURIComponent(q)}&type=${type}`),

  tmdbMovie: (movieId) =>
    requestJson(`/tmdb/movie/${movieId}`),

  tmdbTV: (tvId) =>
    requestJson(`/tmdb/tv/${tvId}`),

  // Downloads
  getDownloads: () =>
    requestJson('/downloads'),

  createDownload: (data) =>
    requestJson('/downloads', { method: 'POST', body: data }),

  updateDownload: (id, data) =>
    requestJson(`/downloads/${id}`, { method: 'PATCH', body: data }),

  deleteDownload: (id, deleteQbTask = false, deleteFiles = false) =>
    requestJson(`/downloads/${id}`, { method: 'DELETE', body: { delete_qb_task: deleteQbTask, delete_files: deleteFiles } }),

  // Tags
  getTags: () =>
    requestJson('/tags'),

  createTag: (name, color) =>
    requestJson('/tags', { method: 'POST', body: { name, color } }),

  deleteTag: (id) =>
    requestJson(`/tags/${id}`, { method: 'DELETE' }),

  updateTag: (id, data) =>
    requestJson(`/tags/${id}`, { method: 'PATCH', body: data }),

  addTagToResource: (resourceId, tagId) =>
    requestJson(`/tags/resources/${resourceId}/tags`, { method: 'POST', body: { tag_id: tagId } }),

  removeTagFromResource: (resourceId, tagId) =>
    requestJson(`/tags/resources/${resourceId}/tags/${tagId}`, { method: 'DELETE' }),

  // Groups
  getGroups: () =>
    requestJson('/groups'),

  createGroup: (name, description) =>
    requestJson('/groups', { method: 'POST', body: { name, description } }),

  updateGroup: (id, data) =>
    requestJson(`/groups/${id}`, { method: 'PATCH', body: data }),

  deleteGroup: (id) =>
    requestJson(`/groups/${id}`, { method: 'DELETE' }),

  getGroup: (id) =>
    requestJson(`/groups/${id}`),

  addToGroup: (groupId, resourceId) =>
    requestJson(`/groups/${groupId}/resources/${resourceId}`, { method: 'POST' }),

  removeFromGroup: (groupId, resourceId) =>
    requestJson(`/groups/${groupId}/resources/${resourceId}`, { method: 'DELETE' }),

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
    requestJson(`/search?q=${encodeURIComponent(q)}&type=${type}`),

  advancedSearch: (criteria) =>
    requestJson('/search/advanced', { method: 'POST', body: criteria }),

  // qBittorrent
  qbStatus: () =>
    requestJson('/qbittorrent/status'),

  qbTorrents: () =>
    requestJson('/qbittorrent/torrents'),

  qbTransferInfo: () =>
    requestJson('/qbittorrent/transfer'),

  qbPause: (hash) =>
    requestJson(`/qbittorrent/torrents/${hash}/pause`, { method: 'POST' }),

  qbResume: (hash) =>
    requestJson(`/qbittorrent/torrents/${hash}/resume`, { method: 'POST' }),

  qbDelete: (hash, deleteFiles = false) =>
    requestJson(`/qbittorrent/torrents/${hash}`, { method: 'DELETE', body: { deleteFiles } }),

  qbFetchMetadata: (resourceId) =>
    requestJson(`/qbittorrent/fetch-metadata/${resourceId}`, { method: 'POST' }),

  // File Cache
  refreshFileCache: (resourceId) =>
    requestJson(`/resources/${resourceId}/refresh-files`, { method: 'POST' }),
};
