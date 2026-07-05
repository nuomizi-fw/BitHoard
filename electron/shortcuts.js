const { globalShortcut } = require('electron');
const { createLogger } = require('./logger');

const log = createLogger('shortcuts');

/**
 * 注册全局快捷键
 * @param {import('electron').BrowserWindow} mainWindow
 */
function registerShortcuts(mainWindow) {
  log('Registering global shortcuts');
  // Ctrl+Shift+B: 显示/隐藏窗口
  const toggleWindow = globalShortcut.register('CommandOrControl+Shift+B', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });

  // Ctrl+Shift+V: 手动捕获剪贴板
  const captureClipboard = globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('shortcut:capture');
    }
  });

  return { toggleWindow, captureClipboard };
}

/**
 * 注销所有全局快捷键
 */
function unregisterAll() {
  log('Unregistering all shortcuts');
  globalShortcut.unregisterAll();
}

module.exports = { registerShortcuts, unregisterAll };
