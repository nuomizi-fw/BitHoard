const { app, ipcMain, clipboard, dialog } = require('electron');
const path = require('path');
const { createWindow } = require('./window');
const { createTray } = require('./tray');
const { registerShortcuts, unregisterAll } = require('./shortcuts');
const { initClipboardMonitor, stopClipboardMonitor } = require('./clipboard-monitor');

let mainWindow = null;
let tray = null;
let serverInstance = null;  // { app, server } 来自 server 模块
const isDev = !app.isPackaged;

/**
 * 启动后端服务器（直接嵌入 Electron 主进程，无需 spawn 子进程）
 */
async function startServer() {
  // 生产模式下，数据库存放在用户数据目录（app.getPath('userData')）
  if (!isDev) {
    const dbDir = path.join(app.getPath('userData'), 'data', 'db');
    process.env.DB_PATH = path.join(dbDir, 'bithoard.db');
  }

  // 动态 ESM import：server 模块是 ESM，Electron 主进程是 CJS
  const serverModule = await import('../server/src/index.js');
  return serverModule.startServer();
}

// IPC 处理器
ipcMain.handle('clipboard:detected', async (event, data) => {
  if (mainWindow) {
    mainWindow.webContents.send('toast:show', data);
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

// 剪贴板读权限（快捷键手动捕获时使用）
ipcMain.handle('clipboard:read', () => {
  return clipboard.readText() || '';
});

// 拖拽文件处理
ipcMain.handle('file:dropped', async (event, filePaths) => {
  const fs = require('fs');
  const path = require('path');
  const results = [];

  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.torrent') {
      // 读取 .torrent 文件为 base64 发送给渲染进程
      const data = fs.readFileSync(filePath);
      results.push({ type: 'torrent', name: path.basename(filePath), data: data.toString('base64') });
    } else {
      // 尝试读取文本内容
      try {
        const text = fs.readFileSync(filePath, 'utf-8');
        results.push({ type: 'text', name: path.basename(filePath), data: text });
      } catch {
        results.push({ type: 'unknown', name: path.basename(filePath) });
      }
    }
  }

  if (mainWindow && results.length > 0) {
    mainWindow.webContents.send('file:dropped', results);
  }

  return results;
});

app.whenReady().then(async () => {
  // ── 生产模式：嵌入启动后端服务器 ──
  // 开发模式下由 pnpm dev:server 单独启动，避免端口冲突
  if (!isDev) {
    console.log('[main] Starting backend server...');
    try {
      serverInstance = await startServer();
      console.log('[main] Server ready');
    } catch (err) {
      console.error('[main] Server start failed:', err.message);
      dialog.showErrorBox('启动失败', `后端服务启动失败，请尝试重新运行。\n\n${err.message}`);
      app.quit();
      return;
    }
  } else {
    console.log('[dev] Using pnpm dev:server for backend');
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

  tray = createTray(mainWindow, { initClipboardMonitor: (win) => initClipboardMonitor(win), stopClipboardMonitor });
  initClipboardMonitor(mainWindow);
  registerShortcuts(mainWindow);
});

app.on('window-all-closed', () => {
  // 不退出，因为还有托盘
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  unregisterAll();
  if (serverInstance) {
    try {
      const serverModule = await import('../server/src/index.js');
      await serverModule.stopServer();
    } catch (err) {
      console.error('[main] Server stop error:', err.message);
    }
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
