/**
 * 剪贴板相关 IPC 处理器
 */
const { ipcMain, clipboard, nativeImage } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../logger');

const log = createLogger('clipboard');

// ── videoLog 引用（由 clipboard-monitor 初始化后注入）──
let _videoLog = null;
function getVideoLog() {
  if (!_videoLog) {
    try { _videoLog = require('../clipboard-monitor').videoLog; } catch { return null; }
  }
  return _videoLog;
}

function registerClipboardIpc() {
  log('Registering clipboard IPC handlers');
  // ── 跨进程日志：preload/renderer 通过此 IPC 写入 clipboard-video.log ──
  ipcMain.handle('clipboard:log-video', (_event, msg) => {
    const log = getVideoLog();
    if (log) log('[IPC-relay]', msg);
  });
  ipcMain.handle('clipboard:read', () => {
    return clipboard.readText() || '';
  });

  // 读取剪贴板图像（返回 PNG data URL 或 null）
  ipcMain.handle('clipboard:read-image', () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    return img.toDataURL();
  });

  // 读取指定路径的视频文件（返回 dataUrl 或 null）
  ipcMain.handle('clipboard:read-video', async (event, filePath) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv', '.m4v': 'video/mp4',
      };
      const mime = mimeMap[ext] || 'video/mp4';
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      return {
        dataUrl: `data:${mime};base64,${base64}`,
        fileName: path.basename(filePath),
        fileSize: stat.size,
      };
    } catch {
      return null;
    }
  });

  // 调试：列出剪贴板所有可用格式（Electron 可见 + PowerShell 底层枚举）
  ipcMain.handle('clipboard:debug-formats', async () => {
    const result = {
      electronFormats: clipboard.availableFormats(),
      psInfo: null,
    };

    try {
      const psScript = `
        $r = @{}
        try {
          Add-Type -AssemblyName System.Windows.Forms
          $files = [System.Windows.Forms.Clipboard]::GetFileDropList()
          if ($files -and $files.Count -gt 0) { $r['HDROP'] = ($files -join "|") }
        } catch { $r['HDROP_err'] = $_.Exception.Message }
        try {
          Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            using System.Text;
            public class CUtil {
              [DllImport("user32.dll")] public static extern int CountClipboardFormats();
              [DllImport("user32.dll")] public static extern uint EnumClipboardFormats(uint f);
              [DllImport("user32.dll")] public static extern bool OpenClipboard(IntPtr h);
              [DllImport("user32.dll")] public static extern bool CloseClipboard();
              [DllImport("user32.dll")] public static extern int GetClipboardFormatName(uint f, StringBuilder n, int c);
            }
"@
          [CUtil]::OpenClipboard([IntPtr]::Zero) | Out-Null
          $r['Count'] = [CUtil]::CountClipboardFormats()
          $ids = @(); $fmt = 0
          while (($fmt = [CUtil]::EnumClipboardFormats($fmt)) -ne 0) {
            $sb = New-Object Text.StringBuilder(256)
            $nOk = [CUtil]::GetClipboardFormatName($fmt, $sb, 256)
            $ids += if ($nOk -gt 0) { $sb.ToString() } else { "ID_$fmt" }
          }
          [CUtil]::CloseClipboard() | Out-Null
          $r['Formats'] = ($ids -join ",")
        } catch { $r['Enum_err'] = $_.Exception.Message }
        $r | ConvertTo-Json -Compress
      `;
      const stdout = await new Promise((resolve, reject) => {
        exec(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
          encoding: 'utf-8', timeout: 2000, windowsHide: true,
        }, (e, out) => e ? reject(e) : resolve(out));
      });
      result.psInfo = JSON.parse((stdout || '').trim() || '{}');
    } catch (e) {
      result.psInfo = { error: e.message };
    }

    return result;
  });

  // 剪贴板检测通知（转发 toast 到渲染进程）
  ipcMain.handle('clipboard:detected', async (event, data) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.webContents.send('toast:show', data);
    }
  });

  // 按需检测剪贴板视频（详情页 Ctrl+V 兜底，返回 dataUrl 或 null）
  ipcMain.handle('clipboard:check-video', async () => {
    try {
      const { checkClipboardVideoForPaste } = require('../clipboard-monitor');
      return await checkClipboardVideoForPaste();
    } catch (e) {
      log('clipboard:check-video error:', e.message);
      return null;
    }
  });
}

module.exports = { registerClipboardIpc };
