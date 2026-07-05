/**
 * 应用信息 IPC 处理器
 */
const { ipcMain, app } = require('electron');

function registerAppInfoIpc() {
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('get-source-app', () => 'unknown');
}

module.exports = { registerAppInfoIpc };
