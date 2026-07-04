import { getToken } from './api.js';

let ws = null;
let reconnectTimer = null;
let listeners = {};

/**
 * WebSocket 客户端
 * 用于接收 qBittorrent 进度推送等实时消息
 */
export const wsClient = {
  /**
   * 连接 WebSocket
   */
  connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = getToken();

    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error('[ws] Connection failed:', e.message);
      this.scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      console.log('[ws] Connected');
      this._emit('connected', null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._emit(msg.type || 'message', msg);

        // 分发特定类型消息
        if (msg.type === 'qb:progress') {
          this._emit('qb:progress', msg);
        } else if (msg.type === 'qb:status') {
          this._emit('qb:status', msg);
        } else if (msg.type === 'clipboard:new') {
          this._emit('clipboard:new', msg);
        }
      } catch (e) {
        console.error('[ws] Parse error:', e.message);
      }
    };

    ws.onclose = () => {
      console.log('[ws] Disconnected');
      this._emit('disconnected', null);
      this.scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[ws] Error:', err);
    };
  },

  /**
   * 发送消息
   */
  send(type, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, ...data }));
  },

  /**
   * 断开连接
   */
  disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  },

  /**
   * 订阅事件
   */
  on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    return () => this.off(event, callback);
  },

  /**
   * 取消订阅
   */
  off(event, callback) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(cb => cb !== callback);
  },

  /**
   * 触发事件
   */
  _emit(event, data) {
    if (!listeners[event]) return;
    for (const cb of listeners[event]) {
      try { cb(data); } catch (e) { console.error('[ws] Listener error:', e); }
    }
  },

  /**
   * 重连
   */
  scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      this.connect();
    }, 3000);
  },
};
