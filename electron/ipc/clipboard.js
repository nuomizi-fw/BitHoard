/**
 * 剪贴板相关 IPC 处理器
 */
const { ipcMain, clipboard, nativeImage } = require('electron');

function registerClipboardIpc() {
  // 读取剪贴板文本
  ipcMain.handle('clipboard:read', () => {
    return clipboard.readText() || '';
  });

  // 读取剪贴板图像（返回 PNG data URL 或 null）
  ipcMain.handle('clipboard:read-image', () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return img.toDataURL();
  });

  // 剪贴板检测通知（转发 toast 到渲染进程）
  ipcMain.handle('clipboard:detected', async (event, data) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.webContents.send('toast:show', data);
    }
  });
}

module.exports = { registerClipboardIpc };
