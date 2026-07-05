const { BrowserWindow } = require('electron');
const path = require('path');
const { createLogger } = require('./logger');

const log = createLogger('window');

/**
 * 创建主窗口
 * - 开发模式：loadURL(Vite dev server :5173)
 * - 生产模式：loadURL(内嵌 Express 服务器 :13002)，直接由服务端提供前端页面
 */
function createWindow(isDev) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: true,
    title: 'BitHoard',
    show: false,
    icon: path.join(__dirname, '../web/static/favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev,
    },
  });

  if (isDev) {
    log('Dev mode: loading http://localhost:5173');
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 生产模式：后端 Express 服务器同时 serve 前端静态文件
    log('Production mode: loading http://127.0.0.1:13002');
    win.loadURL('http://127.0.0.1:13002');
  }

  // F12 打开/关闭 DevTools（开发 & 生产均可用）
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });

  win.once('ready-to-show', () => {
    log('Window ready-to-show');
    win.show();
  });

  return win;
}

module.exports = { createWindow };
