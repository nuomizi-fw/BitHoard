import { writable, derived } from 'svelte/store';

// 认证状态
export const isAuthenticated = writable(!!localStorage.getItem('bithoard_token'));
