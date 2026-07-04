const { app, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { createWindow } = require('./window');
const { createTray } = require('./tray');
const { registerShortcuts, unregisterAll } = require('./shortcuts');
const { initClipboardMonitor } = require('./clipboard-monitor');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const isDev = !app.isPackaged;

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
  if (!isDev) {
    await startServer();
  } else {
    console.log('[dev] Use pnpm -C server dev for backend');
  }

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

  tray = createTray(mainWindow);
  initClipboardMonitor(mainWindow);
  registerShortcuts(mainWindow);
});

app.on('window-all-closed', () => {
  // 不退出，因为还有托盘
});

app.on('before-quit', () => {
  app.isQuitting = true;
  unregisterAll();
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    mainWindow = createWindow(isDev);
    mainWindow.on('close', (e) => {
      if (tray) { e.preventDefault(); mainWindow.hide(); }
    });
  } else {
    mainWindow.show();
  }
});
