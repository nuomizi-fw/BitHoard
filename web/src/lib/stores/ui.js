import { writable } from 'svelte/store';

// 暗色模式
export const darkMode = writable(true);

// Toast 通知队列
export const toasts = writable([]);

let toastId = 0;

export function showToast(data) {
  const id = ++toastId;
  toasts.update(t => [...t, { id, ...data }]);

  // 10秒后自动关闭普通通知
  if (!data.persistent) {
    setTimeout(() => dismissToast(id), 10000);
  }

  return id;
}

export function dismissToast(id) {
  toasts.update(t => t.filter(toast => toast.id !== id));
}

// 暂存区展开状态
export const stagingExpanded = writable(false);

// 侧边栏折叠状态
export const sidebarCollapsed = writable(false);

// 当前视图模式
export const viewMode = writable('list'); // 'list' | 'card'
