import { writable } from 'svelte/store';
import { api } from '../api.js';

function createDownloadsStore() {
  const { subscribe, set, update } = writable({
    items: [],
    loading: false,
  });

  return {
    subscribe,
    async fetch() {
      update(s => ({ ...s, loading: true }));
      try {
        const items = await api.getDownloads();
        update(s => ({ ...s, items, loading: false }));
      } catch (err) {
        update(s => ({ ...s, loading: false }));
      }
    },
    reset() {
      set({ items: [], loading: false });
    },
  };
}

export const downloads = createDownloadsStore();

// qBittorrent 实时进度 (WebSocket 推送)
export const qbProgress = writable({
  torrents: [],
  server_state: null,
});
