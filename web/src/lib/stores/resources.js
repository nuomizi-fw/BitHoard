import { writable } from 'svelte/store';
import { api } from '../api.js';

function createResourcesStore() {
  const { subscribe, set, update } = writable({
    items: [],
    total: 0,
    page: 1,
    loading: false,
  });

  return {
    subscribe,

    async fetch(params = {}) {
      update(s => ({ ...s, loading: true }));
      try {
        const data = await api.getResources(params);
        update(s => ({
          ...s,
          items: data.items,
          total: data.total,
          page: data.page,
          loading: false,
        }));
      } catch (err) {
        update(s => ({ ...s, loading: false }));
      }
    },

    async refresh() {
      // 用上次的参数重新获取
      this.fetch();
    },

    reset() {
      set({ items: [], total: 0, page: 1, loading: false });
    },
  };
}

export const resources = createResourcesStore();

// 暂存区 (draft 状态的资源)
export const stagingResources = writable([]);

// 当前选中的资源
export const selectedResource = writable(null);
