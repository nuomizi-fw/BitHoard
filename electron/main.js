const { app, ipcMain, clipboard, dialog } = require('electron');
const path = require('path');
const { createWindow } = require('./window');
const { createTray, destroyTray } = require('./tray');
const { registerShortcuts, unregisterAll } = require('./shortcuts');
const { initClipboardMonitor, stopClipboardMonitor } = require('./clipboard-monitor');
const { createLogger, closeAllLoggers } = require('./logger');

const log = createLogger('main');

// ── 拆分后的 IPC 处理器 ──
const { registerClipboardIpc } = require('./ipc/clipboard');
const { registerFileDroppedIpc } = require('./ipc/file-dropped');
const { registerAppInfoIpc } = require('./ipc/app-info');

let mainWindow = null;
let tray = null;
let serverInstance = null;  // { app, server } 来自 server 模块
let stopServerFn = null;    // stopServer 函数引用，退出时调用
const isDev = !app.isPackaged;

/**
 * 启动后端服务器（直接嵌入 Electron 主进程，无需 spawn 子进程）
 */
async function startServer() {
  // 生产模式下，数据统一存放在 exe 所在目录的 data/ 下（便携化规范）
  if (!isDev) {
    const exeDir = path.dirname(app.getPath('exe'));
    const dbDir = path.join(exeDir, 'data', 'db');
    process.env.DB_PATH = path.join(dbDir, 'bithoard.db');
  }

  // 动态 ESM import：server 模块是 ESM，Electron 主进程是 CJS
  const serverModule = await import('../server/src/index.js');
  stopServerFn = serverModule.stopServer;
  return serverModule.startServer();
}

// ── 注册 IPC 处理器 ──
registerClipboardIpc();
registerFileDroppedIpc();
registerAppInfoIpc();

app.whenReady().then(async () => {
  // 动态加载共享常量（BTIH 匹配模式），传递给 clipboard-monitor 以保持同步
  let btihPatterns = null;
  try {
    const constants = await import('../server/src/lib/constants.js');
    btihPatterns = constants.BTIH_PATTERNS;
  } catch (err) {
    log('Failed to load BTIH_PATTERNS, clipboard-monitor will use defaults:', err.message);
  }

  // ── 生产模式：嵌入启动后端服务器 ──
  // 开发模式下由 pnpm dev:server 单独启动，避免端口冲突
  if (!isDev) {
    log('Starting backend server...');
    try {
      serverInstance = await startServer();
      log('Server ready');
    } catch (err) {
      log('Server start failed:', err.message);
      dialog.showErrorBox('启动失败', `后端服务启动失败，请尝试重新运行。\n\n${err.message}`);
      app.quit();
      return;
    }
  } else {
    log('[dev] Using pnpm dev:server for backend');
  }

  // ── 创建窗口 ──
  mainWindow = createWindow(isDev);

  mainWindow.on('close', (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  tray = createTray(mainWindow, { initClipboardMonitor: (win) => initClipboardMonitor(win, btihPatterns), stopClipboardMonitor });
  initClipboardMonitor(mainWindow, btihPatterns);
  registerShortcuts(mainWindow);
});

app.on('window-all-closed', () => {
  // 不退出，因为还有托盘
});

app.on('before-quit', async () => {
  app.isQuitting = true;

  // 销毁系统托盘（不销毁会阻止进程退出）
  destroyTray();

  // 停止剪贴板监控（清除 setInterval，防止 PowerShell 子进程残留）
  stopClipboardMonitor();

  // 注销全局快捷键
  unregisterAll();

  // 关闭所有日志流
  closeAllLoggers();

  // 停止后端服务器（关闭 HTTP/WS、数据库连接、轮询定时器）
  if (stopServerFn) {
    try {
      await stopServerFn();
    } catch (err) {
      log('Server stop error:', err.message);
    }
    stopServerFn = null;
    serverInstance = null;
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    mainWindow = createWindow(isDev);
    mainWindow.on('close', (e) => {
      if (tray) { e.preventDefault(); mainWindow.hide(); }
    });
    mainWindow.on('closed', () => { mainWindow = null; });
  } else {
    mainWindow.show();
  }
});
