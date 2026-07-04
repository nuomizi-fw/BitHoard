const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;
let isMonitoring = true;

const TRAY_ICON_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEYSURBVDiNpZMxTsNAEEX/rNeOAwUlHVdA4gJcAokLcAQkLkCBaOhScAQkOgoa7gAVHZyAgoKSK0QiJI5jr3cohuxarGM7VqSRRvP/z/xd7QpLKSil8E+hVNVaKaXWWgshhBBCPIQQb4fD4TWldE2I/X6/CyE8aa0LIcQTIAn4UEVErus+ENE9It57noeqqtLhcPiglEII0TbGfFNKCSGcAGitCSFYawFYay8AfVzXhaZpcr/fv/M8H7TWvhBiyMwMIYREkiTGzN8Acs7PGLOp67oNITzrus7XdX0JIcyZOQVAc84PAI6cc5WmaU0pnRFCBABordv9fv8uhHgRQnzmef5WVdXdMAy3AL4ANJzz4/F4/EopPTHzFjN3JMMwAJBSboQQP+/3B/lARL4AEfUeAAAAAElFTkSuQmCC';

/**
 * 创建系统托盘
 * @param {import('electron').BrowserWindow} mainWindow
 * @param {object} clipboardMonitor - { stopClipboardMonitor, initClipboardMonitor }
 * @returns {Tray}
 */
function createTray(mainWindow, clipboardMonitor) {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  isMonitoring = true;

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 BitHoard', click: () => { mainWindow ? mainWindow.show() : null; } },
    { type: 'separator' },
    {
      label: '剪贴板监控',
      type: 'checkbox',
      checked: isMonitoring,
      click: (item) => {
        isMonitoring = item.checked;
        if (isMonitoring) {
          if (clipboardMonitor?.initClipboardMonitor) {
            clipboardMonitor.initClipboardMonitor(mainWindow);
          }
        } else {
          if (clipboardMonitor?.stopClipboardMonitor) {
            clipboardMonitor.stopClipboardMonitor();
          }
        }
        updateTrayTooltip();
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => { require('electron').app.isQuitting = true; require('electron').app.quit(); } },
  ]);

  tray.setToolTip('BitHoard - 监控中');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow ? mainWindow.show() : null;
  });

  return tray;
}

function updateTrayTooltip() {
  if (!tray) return;
  tray.setToolTip(isMonitoring ? 'BitHoard - 剪贴板监控中' : 'BitHoard - 监控已暂停');
}

/**
 * 更新托盘图标状态
 * @param {'connected'|'disconnected'|'monitoring'} status
 */
function updateTrayStatus(status) {
  if (!tray) return;
  const tooltips = {
    connected: 'BitHoard - qBittorrent 已连接',
    disconnected: 'BitHoard - qBittorrent 未连接',
    monitoring: 'BitHoard - 剪贴板监控中',
  };
  tray.setToolTip(tooltips[status] || 'BitHoard');
}

/**
 * 检查剪贴板监控状态
 */
function getMonitoringState() {
  return isMonitoring;
}

module.exports = { createTray, updateTrayStatus, getMonitoringState };
