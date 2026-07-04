const { clipboard } = require('electron');
const { execSync } = require('child_process');

// 链接匹配正则
const PATTERNS = {
  magnet: /magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,}/gi,
  torrentUrl: /https?:\/\/[^\s"'<>]+\.torrent/gi,
  ed2k: /ed2k:\/\/\|file\|[^|]+\|[a-fA-F0-9]{32}\|/gi,
  // 纯 BTIH hash（32或40位十六进制），识别后自动构造 magnet URI
  btihHash: /\b([a-fA-F0-9]{32,40})\b/g,
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
  const seenUri = new Set();
  const seenHash = new Set();

  // 提取标准 magnet / torrent / ed2k 链接
  for (const [type, pattern] of Object.entries(PATTERNS)) {
    if (type === 'btihHash') continue; // 纯 hash 单独处理
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const uri = match[0];
      if (!seenUri.has(uri)) {
        seenUri.add(uri);
        links.push({ type, uri });
        // 记录已出现的 BTIH hash，避免后续纯 hash 重复
        const hashMatch = uri.match(/btih:([a-fA-F0-9]{32,40})/i);
        if (hashMatch) seenHash.add(hashMatch[1].toLowerCase());
      }
    }
  }

  // 提取纯 BTIH hash，自动构造 magnet URI
  const hashMatches = text.matchAll(PATTERNS.btihHash);
  for (const match of hashMatches) {
    const hash = match[1];
    const lowerHash = hash.toLowerCase();
    if (!seenHash.has(lowerHash)) {
      seenHash.add(lowerHash);
      links.push({ type: 'magnet', uri: `magnet:?xt=urn:btih:${lowerHash}` });
    }
  }

  return links;
}

/**
 * 处理检测到的链接
 * @param {Array} links - 提取到的链接列表
 * @param {string} contextText - 完整的剪贴板文本，用于服务端上下文解析
 */
function handleLinks(links, contextText) {
  if (links.length === 0) return;

  const sourceProcess = getForegroundWindowProcess();
  const sourceApp = getFriendlyAppName(sourceProcess);

  const payload = {
    links,
    sourceApp,
    sourceProcess,
    contextText: contextText || '',
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

  // 保存当前文本用于上下文传递（闭包捕获，避免被后续轮询覆盖）
  const capturedText = currentText;

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

    handleLinks(unique, capturedText);
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
