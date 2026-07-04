const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 剪贴板检测通知（后台轮询自动检测到链接时推送）
  onClipboardDetected: (callback) => {
    ipcRenderer.on('toast:show', (event, data) => callback(data));
  },

  // 手动捕获快捷键（Ctrl+Shift+V）触发
  onShortcutCapture: (callback) => {
    ipcRenderer.on('shortcut:capture', () => callback());
  },

  // 读取剪贴板文本（用于快捷键手动捕获后读取）
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),

  // 版本信息
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // 文件拖拽
  onFileDropped: (callback) => {
    ipcRenderer.on('file:dropped', (event, paths) => callback(paths));
  },

  // 托盘/窗口控制
  minimizeToTray: () => ipcRenderer.send('window:minimize-to-tray'),

  // 来源应用查询
  getSourceApp: () => ipcRenderer.invoke('get-source-app'),
});
