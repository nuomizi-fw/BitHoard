import { get } from 'svelte/store';
import { isAuthenticated } from './stores/auth.js';
import { qbProgress } from './stores/downloads.js';
import { wsClient } from './ws.js';

/**
 * WebSocket 生命周期管理
 *
 * 在 App.svelte onMount 中调用 initWsBridge() 即可完成 WS 连接和事件绑定，
 * 避免将所有回调散落在 App 组件内部。
 */
export function initWsBridge() {
  if (!get(isAuthenticated)) return;

  wsClient.connect();

  wsClient.on('qb:progress', (msg) => {
    if (msg?.torrents) {
      qbProgress.set({
        torrents: msg.torrents,
        server_state: msg.server_state || null,
      });
    }
  });

  wsClient.on('qb:status', (msg) => {
    qbProgress.update((current) => ({
      ...current,
      server_state: msg.server_state || msg,
    }));
  });

  wsClient.on('connected', () => {
    console.log('[App] WebSocket connected, qB progress live');
  });

  wsClient.on('disconnected', () => {
    console.log('[App] WebSocket disconnected, will auto-reconnect');
    // 清空进度数据（断开时显示离线状态）
    qbProgress.set({ torrents: {}, server_state: null });
  });
}
