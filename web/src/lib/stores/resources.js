import { writable } from 'svelte/store';
import { api } from '../api.js';

function createResourcesStore() {
  const { subscribe, set, update } = writable({
    items: [],
    total: 0,
    page: 1,
    limit: 50,
    loading: false,
  });

  let lastParams = {};

  return {
    subscribe,

    async fetch(params = {}) {
      lastParams = { ...params };
      update(s => ({ ...s, loading: true }));
      try {
        const data = await api.getResources(params);
        update(s => ({
          ...s,
          items: data.items,
          total: data.total,
          page: data.page,
          limit: data.limit,
          loading: false,
        }));
      } catch (err) {
        console.error('[store] resources fetch error:', err);
        update(s => ({ ...s, loading: false }));
      }
    },

    async refresh() {
      return this.fetch(lastParams);
    },

    async loadPage(page) {
      return this.fetch({ ...lastParams, page });
    },

    reset() {
      lastParams = {};
      set({ items: [], total: 0, page: 1, limit: 50, loading: false });
    },

    getLastParams() {
      return { ...lastParams };
    },
  };
}

export const resources = createResourcesStore();

// 暂存区：草稿状态资源
export const stagingResources = writable([]);

export const selectedResource = writable(null);
