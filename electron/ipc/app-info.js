/**
 * 应用信息 IPC 处理器
 */
const { ipcMain, app } = require('electron');
const { createLogger } = require('../logger');

const log = createLogger('ipc-app-info');

function registerAppInfoIpc() {
  log('Registering app-info IPC handlers');
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('get-source-app', () => 'unknown');
}

module.exports = { registerAppInfoIpc };
