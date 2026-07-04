import config from '../config.js';

/**
 * qBittorrent API 客户端 (v4.5.0.10)
 */
class QBittorrentClient {
  constructor() {
    this.baseUrl = config.qbittorrent.host;
    this.username = config.qbittorrent.username;
    this.password = config.qbittorrent.password;
    this.sid = null; // 登录后的 SID cookie
    this.connected = false;
  }

  /**
   * 登录获取 SID
   */
  async login() {
    try {
      const formData = new URLSearchParams({
        username: this.username,
        password: this.password,
      });

      const res = await fetch(`${this.baseUrl}/api/v2/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Login failed: ${text}`);
      }

      const setCookie = res.headers.get('set-cookie') || '';
      const match = setCookie.match(/SID=([^;]+)/);
      if (match) {
        this.sid = match[1];
      }
      this.connected = true;
      return true;
    } catch (err) {
      this.connected = false;
      console.error('[qbittorrent] Login error:', err.message);
      return false;
    }
  }

  /**
   * 发送 API 请求
   */
  async request(endpoint, options = {}) {
    if (!this.sid) {
      await this.login();
    }

    const url = `${this.baseUrl}/api/v2${endpoint}`;
    const headers = {
      Cookie: `SID=${this.sid}`,
      ...options.headers,
    };

    try {
      const res = await fetch(url, { ...options, headers });

      // 401 重新登录
      if (res.status === 401) {
        await this.login();
        headers.Cookie = `SID=${this.sid}`;
        const retryRes = await fetch(url, { ...options, headers });
        return retryRes;
      }

      return res;
    } catch (err) {
      this.connected = false;
      throw err;
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const res = await this.request('/app/version');
      if (res.ok) {
        const version = await res.text();
        return { connected: true, version };
      }
      return { connected: false, error: 'Login failed' };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  /**
   * 添加磁链下载任务
   * @param {string} uri - 磁链或种子 URL
   * @param {string} savePath - 保存路径
   * @param {string} category - 分类
   * @returns {Promise<boolean>}
   */
  async addTorrent(uri, savePath = '', category = '') {
    const formData = new URLSearchParams({ urls: uri });
    if (savePath) formData.append('savepath', savePath);
    if (category) formData.append('category', category);

    // 先添加为暂停状态，等元数据加载
    formData.append('paused', 'true');

    const res = await this.request('/torrents/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    return res.ok;
  }

  /**
   * 添加种子文件下载任务
   * @param {Buffer} torrentData - .torrent 文件内容
   * @param {string} savePath
   * @param {string} category
   */
  async addTorrentFile(torrentData, savePath = '', category = '') {
    const formData = new FormData();
    const blob = new Blob([torrentData], { type: 'application/x-bittorrent' });
    formData.append('torrents', blob, 'file.torrent');
    if (savePath) formData.append('savepath', savePath);
    if (category) formData.append('category', category);
    formData.append('paused', 'true');

    const res = await this.request('/torrents/add', {
      method: 'POST',
      body: formData,
    });

    return res.ok;
  }

  /**
   * 获取所有任务列表
   */
  async getTorrents() {
    const res = await this.request('/torrents/info');
    if (!res.ok) return [];
    return res.json();
  }

  /**
   * 获取特定任务的文件列表
   * @param {string} hash - 任务 hash
   */
  async getTorrentFiles(hash) {
    const res = await this.request(`/torrents/files?hash=${hash}`);
    if (!res.ok) return [];
    return res.json();
  }

  /**
   * 获取任务属性（含元数据）
   */
  async getTorrentProperties(hash) {
    const res = await this.request(`/torrents/properties?hash=${hash}`);
    if (!res.ok) return null;
    return res.json();
  }

  /**
   * 暂停任务
   */
  async pauseTorrent(hash) {
    const res = await this.request('/torrents/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}`,
    });
    return res.ok;
  }

  /**
   * 恢复任务
   */
  async resumeTorrent(hash) {
    const res = await this.request('/torrents/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}`,
    });
    return res.ok;
  }

  /**
   * 删除任务
   * @param {string} hash
   * @param {boolean} deleteFiles - 是否同时删除文件
   */
  async deleteTorrent(hash, deleteFiles = false) {
    const res = await this.request('/torrents/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hashes=${hash}&deleteFiles=${deleteFiles}`,
    });
    return res.ok;
  }

  /**
   * 获取全局传输信息 (速度/进度)
   */
  async getTransferInfo() {
    const res = await this.request('/transfer/info');
    if (!res.ok) return null;
    return res.json();
  }

  /**
   * 获取主数据 (用于轮询，返回所有任务简要信息)
   */
  async getSyncMainData(rid = 0) {
    const res = await this.request(`/sync/maindata?rid=${rid}`);
    if (!res.ok) return null;
    return res.json();
  }

  /**
   * 重载配置 (运行时配置更新后调用)
   */
  reconfigure() {
    this.baseUrl = config.qbittorrent.host;
    this.username = config.qbittorrent.username;
    this.password = config.qbittorrent.password;
    this.sid = null;
    this.connected = false;
  }
}

// 单例
const qbClient = new QBittorrentClient();
export default qbClient;
