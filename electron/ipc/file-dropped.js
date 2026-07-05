/**
 * 文件拖拽 IPC 处理器
 */
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../logger');

const log = createLogger('ipc-file-dropped');

function registerFileDroppedIpc() {
  log('Registering file-dropped IPC handler');
  ipcMain.handle('file:dropped', async (event, filePaths) => {
    const results = [];

    for (const filePath of filePaths) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.torrent') {
        log('Torrent file dropped:', path.basename(filePath));
        const data = fs.readFileSync(filePath);
        results.push({ type: 'torrent', name: path.basename(filePath), data: data.toString('base64') });
      } else {
        try {
          const text = fs.readFileSync(filePath, 'utf-8');
          results.push({ type: 'text', name: path.basename(filePath), data: text });
        } catch {
          results.push({ type: 'unknown', name: path.basename(filePath) });
        }
      }
    }

    // 转发到渲染进程
    if (results.length > 0) {
      const win = require('electron').BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.webContents.send('file:dropped', results);
      }
    }

    return results;
  });
}

module.exports = { registerFileDroppedIpc };
