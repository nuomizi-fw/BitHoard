const { clipboard, nativeImage, app } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');

const log = createLogger('clipboard-monitor');

// 默认链接匹配正则（运行时可通过 initClipboardMonitor 的 patterns 参数覆盖）
const DEFAULT_PATTERNS = {
  magnet: /magnet:\?xt=urn:btih:(?:[a-fA-F0-9]{40}|[A-Z2-7]{32})(?=&|\r|\n|$)(?:&[a-zA-Z]+=[^&\r\n]+)*/gi,
  torrentUrl: /https?:\/\/[^\s"'<>]+\.torrent/gi,
  ed2k: /ed2k:\/\/\|file\|[^|]+\|[a-fA-F0-9]{32}\|/gi,
  hex: /\b([a-fA-F0-9]{40})\b/g,
  base32: /\b([A-Z2-7a-z2-7]{32})\b/gi,
  truncatedMagnet: /\b([A-Z2-7a-z2-7]{32}|[a-fA-F0-9]{40})(?:&[a-z]+=[^&\s<>"]+)+\b/gi,
};
let PATTERNS = DEFAULT_PATTERNS;

let lastClipboardText = '';
let lastClipboardImageHash = '';
let lastVideoPath = '';
let lastVideoFormatsStr = '';  // 视频剪贴板格式去重
let lastVideoFormatsTs = 0;    // 上次格式变化时间戳，超时后强制重扫
let monitorInterval = null;
let mainWindow = null;
let batchBuffer = [];
let batchTimer = null;
let foregroundCache = { name: 'unknown', ts: 0 };
const BATCH_WINDOW_MS = 500;
const FOREGROUND_CACHE_MS = 3000; // 前台窗口缓存 3 秒
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB 大文件阈值

// 视频文件扩展名
const VIDEO_EXTENSIONS = /\.(mp4|webm|mkv|avi|mov|wmv|flv|m4v)$/i;
// MIME 类型映射
const VIDEO_MIME_MAP = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.m4v': 'video/mp4',
};

// ── 视频诊断日志：同时输出到控制台 + 写入 data/logs/clipboard-video.log ──
let _videoLogStream = null;
let _videoLogDate = '';

function videoLog(...args) {
  const ts = new Date().toISOString();
  const msg = '[video] ' + args.map(a => {
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');

  // 控制台
  console.log(msg);

  // 文件日志（按天滚动）
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (!_videoLogStream || _videoLogDate !== today) {
      if (_videoLogStream) { try { _videoLogStream.end(); } catch {} }
      // 开发模式 __dirname = electron/，生产模式 app.asar 内只读，改用 exe 所在目录
      const isDev = !app.isPackaged;
      const logDir = isDev
        ? path.join(__dirname, '..', 'data', 'logs')
        : path.join(path.dirname(app.getPath('exe')), 'data', 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      _videoLogStream = fs.createWriteStream(path.join(logDir, 'clipboard-video.log'), { flags: 'a' });
      _videoLogDate = today;
    }
    _videoLogStream.write(ts + ' ' + msg + '\n');
  } catch {}
}

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
    if (type === 'hex' || type === 'base32' || type === 'truncatedMagnet') continue; // 单独处理
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
  const base32Matches = text.matchAll(PATTERNS.base32);
  for (const match of base32Matches) {
    const hash = match[1];
    const lowerHash = hash.toLowerCase();
    if (!seenHash.has(lowerHash)) {
      seenHash.add(lowerHash);
      links.push({ type: 'magnet', uri: `magnet:?xt=urn:btih:${lowerHash}` });
    }
  }

  // 提取纯十六进制 BTIH hash，自动构造 magnet URI
  const hashMatches = text.matchAll(PATTERNS.hex);
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
    videoLog('Sending toast:show links=' + links.length + ' sourceApp=' + sourceApp);
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

  log('Image detected in clipboard');
  const dataUrl = img.toDataURL();
  if (mainWindow) {
    mainWindow.webContents.send('toast:clipboard-image', { dataUrl });
  }
}

/**
 * Check clipboard for video files (for magnet toast video attachment).
 * Runs in the same 500ms polling loop as text/image detection.
 *
 * QQ copies video as "text/uri-list" containing file:// URIs, NOT CF_HDROP.
 * Detection strategies (tried in order):
 *   1. Read text/uri-list via Electron clipboard API (QQ, WeChat, File Explorer)
 *   2. PowerShell: GetFileDropList + EnumClipboardFormats via temp .ps1 file
 *   3. Custom format buffer reader (fallback for messaging apps)
 */
function checkClipboardVideo() {
  const formats = clipboard.availableFormats();
  const formatsStr = JSON.stringify(formats);

  // Skip if formats unchanged AND within debounce window (avoid log spam, but re-scan after 2s)
  if (formatsStr === lastVideoFormatsStr && (Date.now() - lastVideoFormatsTs) < 2000) return;
  lastVideoFormatsStr = formatsStr;
  lastVideoFormatsTs = Date.now();

  videoLog('availableFormats:', formatsStr);

  // ── Strategy 0: text/uri-list (QQ, WeChat, File Explorer copy) ──
  // QQ copies video as a file:// URI in this standard drag-drop format.
  if (formats.includes('text/uri-list')) {
    try {
      const raw = clipboard.read('text/uri-list');
      videoLog('text/uri-list raw type:', typeof raw, 'truthy:', !!raw);
      // Electron may return string or Buffer depending on the source app
      let uriList = '';
      if (Buffer.isBuffer(raw)) {
        uriList = raw.toString('utf-8');
        videoLog('text/uri-list decoded from Buffer, len:', uriList.length);
      } else if (typeof raw === 'string') {
        uriList = raw;
      }
      if (uriList && uriList.trim()) {
        videoLog('text/uri-list content (' + uriList.length + ' chars):', uriList.substring(0, 500));
        // Parse file:// URIs from the list (one per line, or \r\n separated)
        const uris = uriList.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
        for (const uri of uris) {
          let filePath = '';
          if (uri.startsWith('file://')) {
            // Convert file:///C:/path or file://hostname/path to local path
            const url = new URL(uri);
            filePath = decodeURIComponent(url.pathname);
            // On Windows, remove leading / before drive letter
            if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
              filePath = filePath.slice(1);
            }
          } else if (/^[a-zA-Z]:[\\/]/.test(uri)) {
            // Already a Windows path
            filePath = uri;
          }
          if (filePath && VIDEO_EXTENSIONS.test(filePath)) {
            videoLog('Found video via text/uri-list:', filePath);
            readAndSendVideo(filePath);
            return;
          }
        }
      }
    } catch (e) {
      videoLog('text/uri-list read error:', e.message);
    }
  }

  // ── Strategy 1: PowerShell (GetFileDropList + EnumClipboardFormats) via temp file ──
  runPsClipboardCheck();
}

/**
 * Write a PowerShell clipboard diagnostic script to a temp file and execute it.
 * Using a temp .ps1 avoids encoding/escaping issues when the script contains
 * non-ASCII characters or complex heredoc syntax.
 */
function runPsClipboardCheck() {
  const psScript = `
$ErrorActionPreference = 'Stop'
$r = @{}

# A: GetFileDropList (CF_HDROP)
try {
  Add-Type -AssemblyName System.Windows.Forms
  $files = [System.Windows.Forms.Clipboard]::GetFileDropList()
  if ($files -and $files.Count -gt 0) { $r['HDROP'] = ($files -join "|") }
} catch { $r['HDROP_err'] = $_.Exception.Message }

# B: Enumerate all clipboard format IDs via Win32 API
try {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CU {
  [DllImport("user32.dll")] public static extern int CountClipboardFormats();
  [DllImport("user32.dll")] public static extern uint EnumClipboardFormats(uint f);
  [DllImport("user32.dll")] public static extern bool OpenClipboard(IntPtr h);
  [DllImport("user32.dll")] public static extern bool CloseClipboard();
  [DllImport("user32.dll")] public static extern int GetClipboardFormatName(uint f, StringBuilder n, int c);
}
"@
  [CU]::OpenClipboard([IntPtr]::Zero) | Out-Null
  $r['FmtCount'] = [CU]::CountClipboardFormats()
  $ids = @(); $fmt = 0
  while (($fmt = [CU]::EnumClipboardFormats($fmt)) -ne 0) {
    $sb = New-Object Text.StringBuilder(256)
    $ok = [CU]::GetClipboardFormatName($fmt, $sb, 256)
    $ids += if ($ok -gt 0) { $sb.ToString() } else { "ID_$fmt" }
  }
  [CU]::CloseClipboard() | Out-Null
  $r['Fmts'] = ($ids -join ",")
} catch { $r['Enum_err'] = $_.Exception.Message }

$r | ConvertTo-Json -Compress
`;

  const isDev = !app.isPackaged;
  const logDir = isDev
    ? path.join(__dirname, '..', 'data', 'logs')
    : path.join(path.dirname(app.getPath('exe')), 'data', 'logs');
  const psPath = path.join(logDir, '_clip.ps1');
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(psPath, psScript, 'utf-8');
  } catch (e) {
    // If we can't write the temp file, use inline (may fail with complex scripts)
    videoLog('Cannot write PS temp file:', e.message);
    return;
  }

  exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, {
    encoding: 'utf-8',
    timeout: 3000,
    windowsHide: true,
  }, (err, stdout) => {
    // Clean up temp file
    try { fs.unlinkSync(psPath); } catch {}

    if (err) {
      videoLog('PS exec error:', err.message);
      return;
    }
    const raw = (stdout || '').trim();
    if (!raw) return;

    videoLog('PS raw stdout (' + raw.length + ' chars):', raw.substring(0, 500));

    let ps = {};
    try { ps = JSON.parse(raw); } catch (e) {
      videoLog('PS JSON parse error:', e.message);
      return;
    }

    // Check HDROP file list
    if (ps.HDROP) {
      const filePaths = ps.HDROP.split('|').filter(Boolean);
      videoLog('HDROP files:', filePaths);
      const vp = filePaths.find(p => VIDEO_EXTENSIONS.test(p));
      if (vp) { readAndSendVideo(vp); return; }
    }

    // Check custom format names
    if (ps.Fmts) {
      const names = ps.Fmts.split(',');
      videoLog('All format names:', names);
      const vf = names.find(n =>
        /file|video|media|embed|object|shell|qq|wechat|tencent/i.test(String(n))
      );
      if (vf) {
        videoLog('Found potential video format:', vf);
        tryReadCustomFormat(vf);
        return;
      }
    }

    if (ps.FmtCount > 0 && !ps.HDROP) {
      videoLog('Clipboard has', ps.FmtCount, 'formats but no HDROP. Formats:', ps.Fmts || '?');
    }

    // Reset tracking if clipboard is effectively empty
    if (!ps.HDROP && (ps.FmtCount || 0) <= 1) {
      if (lastVideoPath) lastVideoPath = '';
    }
  });
}

/**
 * 读取文件并发送视频到渲染进程
 */
function readAndSendVideo(videoPath) {
  if (videoPath === lastVideoPath) return;
  lastVideoPath = videoPath;

  try {
    if (!fs.existsSync(videoPath)) {
      videoLog('File not found:', videoPath);
      return;
    }
    const stat = fs.statSync(videoPath);
    const ext = path.extname(videoPath).toLowerCase();
    const mime = VIDEO_MIME_MAP[ext] || 'video/mp4';
    const buffer = fs.readFileSync(videoPath);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    videoLog('Sending video:', { fileName: path.basename(videoPath), fileSize: stat.size, oversized: stat.size > LARGE_FILE_THRESHOLD });

    videoLog('mainWindow state:', {
      exists: !!mainWindow,
      destroyed: mainWindow ? mainWindow.isDestroyed() : 'N/A',
      webContentsReady: mainWindow && !mainWindow.isDestroyed() ? !mainWindow.webContents.isDestroyed() : 'N/A',
    });

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toast:clipboard-video', {
        dataUrl,
        fileName: path.basename(videoPath),
        fileSize: stat.size,
        oversized: stat.size > LARGE_FILE_THRESHOLD,
      });
      videoLog('IPC send done: toast:clipboard-video sent successfully');
    } else {
      videoLog('SKIP send: mainWindow null or destroyed');
    }
  } catch (readErr) {
    videoLog('Read error:', readErr.message);
    lastVideoPath = '';
  }
}

/**
 * 尝试通过 Electron clipboard API 读取自定义格式
 * 自定义格式名在 Electron 中可能以 "CF_" 前缀或原始名称出现
 */
function tryReadCustomFormat(formatName) {
  try {
    // Electron clipboard.read() 支持标准格式和自定义格式名
    // 尝试用原始格式名和去掉 "CF_" 前缀的格式名读取
    const candidates = [formatName, formatName.replace(/^CF_/i, '')];
    for (const fmt of candidates) {
      try {
        const data = clipboard.read(fmt);
        if (data) {
          videoLog('Read custom format OK:', fmt, 'size:', data.length || data.byteLength || '?');
          // 如果是 Buffer，尝试写入临时文件并检测
          if (Buffer.isBuffer(data) && data.length > 1024) {
            // 尝试从 buffer 头字节推断格式
            const head = data.slice(0, 16);
            videoLog('Buffer head (hex):', head.toString('hex'));
            // 常见视频文件签名
            const sigs = {
              'ftyp': 'mp4',
              '1a45dfa3': 'webm/mkv',
              '52494646': 'avi',
              '000001ba': 'mpeg',
              '000001b3': 'mpeg',
            };
            const headHex = head.toString('hex');
            for (const [sig, type] of Object.entries(sigs)) {
              if (headHex.startsWith(sig) || head.toString('ascii').includes(sig)) {
                videoLog('Buffer looks like:', type);
                const ext = type.includes('/') ? type.split('/')[0] : type;
                const mime = type.includes('/') ? `video/${type.split('/')[1]}` : (VIDEO_MIME_MAP[`.${ext}`] || 'video/mp4');
                const base64 = data.toString('base64');
                const dataUrl = `data:${mime};base64,${base64}`;
                if (mainWindow) {
                  mainWindow.webContents.send('toast:clipboard-video', {
                    dataUrl,
                    fileName: `clipboard.${ext}`,
                    fileSize: data.length,
                    oversized: data.length > LARGE_FILE_THRESHOLD,
                  });
                }
                return;
              }
            }
          }
        }
      } catch (e) {
        videoLog('read(' + fmt + ') failed:', e.message);
      }
    }
  } catch (e) {
    videoLog('tryReadCustomFormat error:', e.message);
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

  log('Links detected:', links.length, 'links found in clipboard text');

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
function initClipboardMonitor(win, patterns) {
  mainWindow = win;
  if (patterns) PATTERNS = patterns;

  log('Monitor started, interval=500ms');

  // 轮询间隔 500ms（同时检查文本、图像和视频）
  monitorInterval = setInterval(() => {
    checkClipboard();
    checkClipboardImage();
    checkClipboardVideo();
  }, 500);
}

/**
 * 停止监控
 */
function stopClipboardMonitor() {
  log('Monitor stopped');
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}

module.exports = { initClipboardMonitor, stopClipboardMonitor, videoLog };
