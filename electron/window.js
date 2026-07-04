const { BrowserWindow } = require('electron');
const path = require('path');

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
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 生产模式：后端 Express 服务器同时 serve 前端静态文件
    win.loadURL('http://127.0.0.1:13002');
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}

module.exports = { createWindow };
