const { clipboard, nativeImage } = require('electron');
const { exec } = require('child_process');

// 链接匹配正则（与 server/src/lib/constants.js BTIH_PATTERNS 保持同步）
const PATTERNS = {
  magnet: /magnet:\?xt=urn:btih:(?:[a-fA-F0-9]{40}|[A-Z2-7]{32})(?=&|\r|\n|$)(?:&[a-zA-Z]+=[^&\r\n]+)*/gi,
  torrentUrl: /https?:\/\/[^\s"'<>]+\.torrent/gi,
  ed2k: /ed2k:\/\/\|file\|[^|]+\|[a-fA-F0-9]{32}\|/gi,
  btihHash: /\b([a-fA-F0-9]{40})\b/g,
  btihBase32: /\b([A-Z2-7a-z2-7]{32})\b/gi,
  truncatedMagnet: /\b([A-Z2-7a-z2-7]{32}|[a-fA-F0-9]{40})(?:&[a-z]+=[^&\s<>"]+)+\b/gi,
};

let lastClipboardText = '';
let lastClipboardImageHash = '';
let monitorInterval = null;
let mainWindow = null;
let batchBuffer = [];
let batchTimer = null;
let foregroundCache = { name: 'unknown', ts: 0 };
const BATCH_WINDOW_MS = 500;
const FOREGROUND_CACHE_MS = 3000; // 前台窗口缓存 3 秒

/**
 * 获取当前前台窗口进程名，用于判断来源应用（异步，带缓存）
 */
function getForegroundWindowProcess() {
  return new Promise((resolve) => {
    // 缓存命中，直接返回
    if (Date.now() - foregroundCache.ts < FOREGROUND_CACHE_MS) {
      resolve(foregroundCache.name);
      return;
    }

    try {
      const script = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          using System.Diagnostics;
          using System.Text;
          public class WinAPI {
            [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
          }
"@
        $hwnd = [WinAPI]::GetForegroundWindow()
        $pid = 0
        [WinAPI]::GetWindowThreadProcessId($hwnd, [ref]$pid)
        try { (Get-Process -Id $pid).ProcessName } catch { "unknown" }
      `;
      exec(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        encoding: 'utf-8',
        timeout: 1000,
        windowsHide: true,
      }, (err, stdout) => {
        if (err) {
          resolve(foregroundCache.name);
          return;
        }
        const name = (stdout || '').trim() || 'unknown';
        foregroundCache = { name, ts: Date.now() };
        resolve(name);
      });
    } catch {
      resolve(foregroundCache.name);
    }
  });
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
    if (type === 'btihHash' || type === 'btihBase32' || type === 'truncatedMagnet') continue; // 单独处理
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const uri = match[0];
      if (!seenUri.has(uri)) {
        seenUri.add(uri);
        links.push({ type, uri });
        // 记录已出现的 BTIH hash，避免后续纯 hash 重复
        const hashMatch = uri.match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
        if (hashMatch) seenHash.add(hashMatch[1].toLowerCase());
      }
    }
  }

  // 提取截断磁链（hash&dn=xxx&xl=xxx），补全为完整 magnet URI
  // 注意：跳过已被完整 magnet URI 覆盖的 hash，避免同一链接重复入库
  const truncatedMatches = text.matchAll(PATTERNS.truncatedMagnet);
  for (const match of truncatedMatches) {
    const hash = match[1];
    if (hash && seenHash.has(hash.toLowerCase())) continue;
    const uri = 'magnet:?xt=urn:btih:' + match[0];
    if (!seenUri.has(uri)) {
      seenUri.add(uri);
      links.push({ type: 'magnet', uri });
      if (hash) seenHash.add(hash.toLowerCase());
    }
  }

  // 提取纯 Base32 BTIH hash，自动构造 magnet URI
  const base32Matches = text.matchAll(PATTERNS.btihBase32);
  for (const match of base32Matches) {
    const hash = match[1];
    const lowerHash = hash.toLowerCase();
    if (!seenHash.has(lowerHash)) {
      seenHash.add(lowerHash);
      links.push({ type: 'magnet', uri: `magnet:?xt=urn:btih:${lowerHash}` });
    }
  }

  // 提取纯十六进制 BTIH hash，自动构造 magnet URI
  const hashMatches = text.matchAll(PATTERNS.btihHash);
  for (const match of hashMatches) {
    const hash = match[1];
    const lowerHash = hash.toLowerCase();
    if (!seenHash.has(lowerHash)) {
      seenHash.add(lowerHash);
      links.push({ type: 'magnet', uri: `magnet:?xt=urn:btih:${lowerHash}` });
    }
  }

  // 干扰字符滤除：仅在没有找到结构化链接时才执行
  // 如果已匹配到标准 magnet / torrent / ed2k 链接，说明来源正规，
  // 跳过全局拼接扫描以避免从 URL 编码参数等残留文本中拼出假 hash
  const hasStructuredLinks = links.some(l => l.type === 'magnet' || l.type === 'torrentUrl' || l.type === 'ed2k');
  if (hasStructuredLinks) return links;

  // 例如 "8C3DAB25中897A56F7B052F文3013AF删274671E掉4DF200" → 提取为有效 hash
  let cleanedText = text;
  // 移除已知的 magnet URI、截断磁链、纯hash，避免从 URI 元数据中拼出假hash
  for (const r of links) {
    // 从文本中移除已匹配的 URI（处理转义后做简单替换）
    cleanedText = cleanedText.split(r.uri).join('');
  }
  // 额外移除任意 magnet:? 前缀残留
  cleanedText = cleanedText.replace(PATTERNS.magnet, '');

  const hexOnly = cleanedText.replace(/[^a-fA-F0-9]/g, '');
  for (let i = 0; i <= hexOnly.length - 40; i++) {
    const candidate = hexOnly.substring(i, i + 40);
    if (/^[a-fA-F0-9]{40}$/.test(candidate)) {
      const lower = candidate.toLowerCase();
      if (!seenHash.has(lower)) {
        seenHash.add(lower);
        links.push({ type: 'magnet', uri: `magnet:?xt=urn:btih:${lower}` });
      }
      i += 39;
    }
  }

  const base32Only = cleanedText.replace(/[^A-Z2-7a-z2-7]/gi, '');
  for (let i = 0; i <= base32Only.length - 32; i++) {
    const candidate = base32Only.substring(i, i + 32);
    if (/^[A-Z2-7a-z2-7]{32}$/i.test(candidate)) {
      const lower = candidate.toLowerCase();
      if (!seenHash.has(lower)) {
        seenHash.add(lower);
        links.push({ type: 'magnet', uri: `magnet:?xt=urn:btih:${lower}` });
      }
      i += 31;
    }
  }

  return links;
}

/**
 * 处理检测到的链接（异步获取来源应用）
 * @param {Array} links - 提取到的链接列表
 * @param {string} contextText - 完整的剪贴板文本，用于服务端上下文解析
 */
async function handleLinks(links, contextText) {
  if (links.length === 0) return;

  const sourceProcess = await getForegroundWindowProcess();
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
 * 检查剪贴板图像（用于磁链 toast 截图）
 * 与文本检测共用同一个 500ms 轮询
 */
function checkClipboardImage() {
  const img = clipboard.readImage();
  if (img.isEmpty()) {
    // 剪贴板无图像，清除跟踪
    if (lastClipboardImageHash) lastClipboardImageHash = '';
    return;
  }

  // 用 PNG buffer 前 256 字节做简易去重 hash
  const png = img.toPNG();
  const hashSample = png.slice(0, Math.min(256, png.length)).toString('base64');

  if (hashSample === lastClipboardImageHash) return;
  lastClipboardImageHash = hashSample;

  const dataUrl = img.toDataURL();
  if (mainWindow) {
    mainWindow.webContents.send('toast:clipboard-image', { dataUrl });
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

  // 轮询间隔 500ms（同时检查文本和图像）
  monitorInterval = setInterval(() => {
    checkClipboard();
    checkClipboardImage();
  }, 500);
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
