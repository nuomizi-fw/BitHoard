const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 剪贴板检测通知
  onClipboardDetected: (callback) => {
    ipcRenderer.on('toast:show', (event, data) => callback(data));
  },

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
