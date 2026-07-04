const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { initClipboardMonitor } = require('./clipboard-monitor');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: true,
    title: 'BitHoard',
    icon: path.join(__dirname, '../web/static/favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev,
    },
  });

  const url = isDev
    ? 'http://localhost:5173'
    : `http://localhost:${process.env.SERVER_PORT || 13002}`;

  mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (e) => {
    // 最小化到托盘而不是退出
    if (tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEYSURBVDiNpZMxTsNAEEX/rNeOAwUlHVdA4gJcAokLcAQkLkCBaOhScAQkOgoa7gAVHZyAgoKSK0QiJI5jr3cohuxarGM7VqSRRvP/z/xd7QpLKSil8E+hVNVaKaXWWgshhBBCPIQQb4fD4TWldE2I/X6/CyE8aa0LIcQTIAn4UEVErus+ENE9It57noeqqtLhcPiglEII0TbGfFNKCSGcAGitCSFYawFYay8AfVzXhaZpcr/fv/M8H7TWvhBiyMwMIYREkiTGzN8Acs7PGLOp67oNITzrus7XdX0JIcyZOQVAc84PAI6cc5WmaU0pnRFCBABordv9fv8uhHgRQnzmef5WVdXdMAy3AL4ANJzz4/F4/EopPTHzFjN3JMMwAJBSboQQP+/3B/lARL4AEfUeAAAAAElFTkSuQmCC'
  );
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 BitHoard', click: () => { mainWindow ? mainWindow.show() : createWindow(); } },
    { type: 'separator' },
    { label: '暂停剪贴板监控', type: 'checkbox', checked: true, click: (item) => { /* toggle */ } },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('BitHoard');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow ? mainWindow.show() : createWindow();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, '..', 'server', 'src', 'index.js');
    serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, SERVER_PORT: process.env.SERVER_PORT || '13002' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      console.log('[server]', msg);
      if (msg.includes('Server running')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[server:err]', data.toString());
    });

    serverProcess.on('error', reject);

    // 5秒超时
    setTimeout(resolve, 5000);
  });
}

// IPC 处理器
ipcMain.handle('clipboard:detected', async (event, data) => {
  if (mainWindow) {
    mainWindow.webContents.send('toast:show', data);
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

app.whenReady().then(async () => {
  if (!isDev) {
    await startServer();
  } else {
    console.log('[dev] Use npm run dev:server for backend');
  }

  createTray();
  createWindow();
  initClipboardMonitor(mainWindow);

  // 全局快捷键: Ctrl+Shift+B 打开窗口
  globalShortcut.register('CommandOrControl+Shift+B', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });

  // 拖拽文件处理
  ipcMain.handle('file:dropped', async (event, filePaths) => {
    // 将在 drag-drop.js 中处理
    return filePaths;
  });
});

app.on('window-all-closed', () => {
  // 不退出，因为还有托盘
});

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
  else mainWindow.show();
});
