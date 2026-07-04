const { clipboard } = require('electron');
const { execSync } = require('child_process');

// 链接匹配正则
const PATTERNS = {
  magnet: /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,}/gi,
  torrentUrl: /https?:\/\/[^\s"'<>]+\.torrent/gi,
  ed2k: /ed2k:\/\/\|file\|[^|]+\|[a-fA-F0-9]{32}\|/gi,
};

let lastClipboardText = '';
let monitorInterval = null;
let mainWindow = null;
let batchBuffer = [];
let batchTimer = null;
const BATCH_WINDOW_MS = 500;

/**
 * 获取当前前台窗口进程名，用于判断来源应用
 */
function getForegroundWindowProcess() {
  try {
    // 使用 PowerShell 获取前台窗口进程名
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Diagnostics;
        using System.Text;
        public class WinAPI {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
          [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
        }
"@
      $hwnd = [WinAPI]::GetForegroundWindow()
      $pid = 0
      [WinAPI]::GetWindowThreadProcessId($hwnd, [ref]$pid)
      try { (Get-Process -Id $pid).ProcessName } catch { "unknown" }
    `;
    const result = execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      encoding: 'utf-8',
      timeout: 1000,
      windowsHide: true,
    });
    return result.trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 进程名 → 友好名映射
 */
const APP_NAME_MAP = {
  'wechat': '微信',
  'weixin': '微信',
  'qq': 'QQ',
  'chrome': 'Chrome',
  'msedge': 'Edge',
  'firefox': 'Firefox',
  'explorer': '文件资源管理器',
  'notepad': '记事本',
  'telegram': 'Telegram',
  'discord': 'Discord',
  'thunder': '迅雷',
  'qbittorrent': 'qBittorrent',
};

function getFriendlyAppName(processName) {
  const lower = processName.toLowerCase();
  return APP_NAME_MAP[lower] || processName;
}

/**
 * 从文本中提取所有链接
 */
function extractLinks(text) {
  const links = [];
  const seen = new Set();

  for (const [type, pattern] of Object.entries(PATTERNS)) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const uri = match[0];
      if (!seen.has(uri)) {
        seen.add(uri);
        links.push({ type, uri });
      }
    }
  }

  return links;
}

/**
 * 处理检测到的链接
 */
function handleLinks(links) {
  if (links.length === 0) return;

  const sourceProcess = getForegroundWindowProcess();
  const sourceApp = getFriendlyAppName(sourceProcess);

  const payload = {
    links,
    sourceApp,
    sourceProcess,
    timestamp: Date.now(),
  };

  // 发送到渲染进程
  if (mainWindow) {
    mainWindow.webContents.send('toast:show', payload);
  }
}

/**
 * 检查剪贴板
 */
function checkClipboard() {
  const currentText = clipboard.readText();

  if (!currentText || currentText === lastClipboardText) return;

  lastClipboardText = currentText;
  const links = extractLinks(currentText);

  if (links.length === 0) return;

  // 批量处理：短时间内多个链接进入暂存区
  batchBuffer.push(...links);

  if (batchTimer) clearTimeout(batchTimer);

  batchTimer = setTimeout(() => {
    const batch = [...batchBuffer];
    batchBuffer = [];

    // 去重
    const unique = [];
    const seen = new Set();
    for (const link of batch) {
      if (!seen.has(link.uri)) {
        seen.add(link.uri);
        unique.push(link);
      }
    }

    handleLinks(unique);
  }, BATCH_WINDOW_MS);
}

/**
 * 初始化剪贴板监控
 */
function initClipboardMonitor(win) {
  mainWindow = win;

  // 轮询间隔 500ms
  monitorInterval = setInterval(checkClipboard, 500);
}

/**
 * 停止监控
 */
function stopClipboardMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}

module.exports = { initClipboardMonitor, stopClipboardMonitor };
