const { contextBridge, ipcRenderer } = require('electron');

// ── 全局视频缓冲：video IPC 可能先于 ToastItem 挂载到达 ──
let _pendingVideo = null;
let _videoCallback = null;

// 全局监听 toast:clipboard-video（只注册一次，不依赖 ToastItem 生命周期）
ipcRenderer.on('toast:clipboard-video', (_event, data) => {
  console.log('[preload] toast:clipboard-video received:', data?.fileName, data?.fileSize);
  ipcRenderer.invoke('clipboard:log-video', '[preload] received: ' + (data?.fileName || '?') + ' size=' + (data?.fileSize || '?'));
  if (_videoCallback) {
    _videoCallback(data);
  } else {
    // ToastItem 还未注册，缓冲等待
    _pendingVideo = data;
    ipcRenderer.invoke('clipboard:log-video', '[preload] buffered video (no callback)');
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  // 剪贴板检测通知（后台轮询自动检测到链接时推送）
  onClipboardDetected: (callback) => {
    ipcRenderer.on('toast:show', (event, data) => callback(data));
  },

  // 剪贴板图像检测（后台轮询检测到图片时推送，用于截图）
  onClipboardImage: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('toast:clipboard-image', handler);
    return () => ipcRenderer.removeListener('toast:clipboard-image', handler);
  },

  // 剪贴板视频检测（全局监听，ToastItem 注册回调时重放已缓冲的视频）
  onClipboardVideo: (callback) => {
    _videoCallback = callback;
    ipcRenderer.invoke('clipboard:log-video', '[preload] callback registered, pending=' + !!_pendingVideo);
    // 重放：ToastItem 挂载前到达的视频现在交付
    if (_pendingVideo) {
      ipcRenderer.invoke('clipboard:log-video', '[preload] replaying buffered video: ' + _pendingVideo.fileName);
      callback(_pendingVideo);
      _pendingVideo = null;
    }
    return () => {
      _videoCallback = null;
      // 保留 _pendingVideo 给下一个 ToastItem
    };
  },

  // 写视频诊断日志到 data/logs/clipboard-video.log（renderer 进程调用）
  logVideo: (msg) => ipcRenderer.invoke('clipboard:log-video', msg),

  // 手动捕获快捷键（Ctrl+Shift+V）触发
  onShortcutCapture: (callback) => {
    ipcRenderer.on('shortcut:capture', () => callback());
  },

  // 读取剪贴板文本（用于快捷键手动捕获后读取）
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),

  // 读取剪贴板图像（返回 data URL 或 null）
  readClipboardImage: () => ipcRenderer.invoke('clipboard:read-image'),

  // 按需检测剪贴板视频（详情页 Ctrl+V 兜底，返回 {dataUrl,fileName,fileSize} 或 null）
  checkClipboardVideo: () => ipcRenderer.invoke('clipboard:check-video'),

  // 调试：列出剪贴板所有可用格式（返回 Electron + PowerShell 枚举结果）
  debugClipboardFormats: () => ipcRenderer.invoke('clipboard:debug-formats'),

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
