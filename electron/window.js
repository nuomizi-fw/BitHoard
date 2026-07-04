const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * 创建主窗口
 * @param {boolean} isDev
 * @returns {BrowserWindow}
 */
function createWindow(isDev) {
  const win = new BrowserWindow({
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

  win.loadURL(url);

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

module.exports = { createWindow };
