/**
 * 标题智能提取服务
 *
 * 从剪切板/拖拽的原始文本中，结合磁链 URI，智能推测资源标题。
 * 优先级：dn= 参数 > 上下文相邻行分析 > 回退默认名
 */

/**
 * 从磁链 URI 的 dn= 参数提取显示名称
 * 供外部模块复用（如 resources.js 的 extractMagnetName 与此相同）
 */
export function extractDnName(uri) {
  const match = uri.match(/[?&]dn=([^&]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\+/g, ' ');
  } catch {
    return match[1].replace(/\+/g, ' ');
  }
}

/**
 * 清洗候选标题文本
 * - 去除首尾空白
 * - 去除常见的括号标签（【】[]（）()｛｝）
 * - 压缩多余空白
 * - 去除 URL 残留
 */
function cleanTitle(raw) {
  if (!raw || !raw.trim()) return null;
  let t = raw.trim();

  // 去除各种括号及其内容（常见的中日文标签）
  t = t.replace(/[【\[｛].*?[】\]｝]/g, '');
  t = t.replace(/[（(].*?[）)]/g, '');

  // 去除磁链、URL
  t = t.replace(/magnet:\?[^\s]+/gi, '');
  t = t.replace(/https?:\/\/[^\s]+/gi, '');
  t = t.replace(/\b[a-fA-F0-9]{40}\b/g, '');
  t = t.replace(/\b[A-Z2-7a-z2-7]{32}\b/gi, '');

  // 去除常见的序列号/集数前缀残渣（保留有意义的标题部分）
  t = t.replace(/[<>"']/g, '');

  // 压缩多余空白
  t = t.replace(/\s+/g, ' ').trim();

  // 结果太短（<=2字符）视为无效
  if (t.length <= 2) return null;

  return t;
}

/**
 * 判断一行文本是否是"噪音行"（URL、hash、空白、分隔符等）
 */
function isNoiseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  // 纯磁链
  if (/^magnet:\?/.test(trimmed)) return true;
  // 纯 URL
  if (/^https?:\/\//.test(trimmed)) return true;
  // 纯 hash（十六进制或 Base32）
  if (/^[a-fA-F0-9]{40}$/.test(trimmed)) return true;
  if (/^[A-Z2-7a-z2-7]{32}$/i.test(trimmed)) return true;
  // 纯分隔符
  if (/^[-=*_#~]{3,}$/.test(trimmed)) return true;
  return false;
}

/**
 * 从上下文文本中提取与特定磁链相关的上下文片段（前后各 2 行）
 * 用于 raw_context 按链接存精确小上下文，而非存整段剪贴板文本。
 *
 * @param {string} contextText - 完整的剪切板/文件文本
 * @param {string} magnetUri - 磁链 URI
 * @returns {string} 相关的上下文片段，最多保留磁链所在行前后各 2 行
 */
export function extractContextSnippet(contextText, magnetUri) {
  if (!contextText || !contextText.trim()) return '';

  const hashMatch = magnetUri.match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
  const hash = hashMatch ? hashMatch[1] : null;
  if (!hash) return contextText.substring(0, 500);

  const lines = contextText.split(/\r?\n/);
  let hashLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(hash.toLowerCase())) {
      hashLineIndex = i;
      break;
    }
  }

  if (hashLineIndex === -1) {
    // 没找到 hash 所在行，回退到 magnet: 关键词
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('magnet:')) {
        hashLineIndex = i;
        break;
      }
    }
  }

  if (hashLineIndex === -1) {
    // 截断回退：最多取前 500 字符
    return contextText.substring(0, 500);
  }

  const start = Math.max(0, hashLineIndex - 2);
  const end = Math.min(lines.length, hashLineIndex + 3); // +3 = 该行 + 后 2 行
  const snippet = lines.slice(start, end).join('\n').trim();

  // 防止片段仍然过大（例如某一行极长），上限 2000 字符
  return snippet.length > 2000 ? snippet.substring(0, 2000) : snippet;
}

/**
 * 从上下文文本中提取候选标题
 *
 * @param {string} contextText - 完整的剪切板/文件文本
 * @param {string} magnetUri - 磁链 URI
 * @returns {{ suggestedTitle: string, source: string }}
 *   source 表示标题来源：'dn' | 'context-prev-line' | 'context-next-line' | 'context-first-meaningful' | 'fallback'
 */
export function extractCandidateTitle(contextText, magnetUri) {
  // 1) 优先从 dn= 参数提取
  const dnName = extractDnName(magnetUri);
  if (dnName && dnName.trim().length > 0) {
    const cleaned = cleanTitle(dnName);
    if (cleaned) return { suggestedTitle: cleaned, source: 'dn' };
  }

  // 没有上下文文本，回退
  if (!contextText || !contextText.trim()) {
    return { suggestedTitle: '未命名资源', source: 'fallback' };
  }

  // 2) 从 BTIH hash 中提取 hash 值，在上下文中定位其所在行
  const hashMatch = magnetUri.match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
  const hash = hashMatch ? hashMatch[1] : null;

  const lines = contextText.split(/\r?\n/);
  let hashLineIndex = -1;

  if (hash) {
    // 查找包含该 hash 的行
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(hash.toLowerCase())) {
        hashLineIndex = i;
        break;
      }
    }
  } else {
    // 没有 hash，尝试定位包含 magnet URI 的行
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(magnetUri) || lines[i].includes('magnet:')) {
        hashLineIndex = i;
        break;
      }
    }
  }

  // 3) 尝试取 hash 所在行的前一行作为标题
  if (hashLineIndex > 0) {
    const prevLine = lines[hashLineIndex - 1];
    if (!isNoiseLine(prevLine)) {
      const cleaned = cleanTitle(prevLine);
      if (cleaned) return { suggestedTitle: cleaned, source: 'context-prev-line' };
    }
  }

  // 4) 尝试取 hash 所在行的后一行
  if (hashLineIndex >= 0 && hashLineIndex < lines.length - 1) {
    const nextLine = lines[hashLineIndex + 1];
    if (!isNoiseLine(nextLine)) {
      const cleaned = cleanTitle(nextLine);
      if (cleaned) return { suggestedTitle: cleaned, source: 'context-next-line' };
    }
  }

  // 5) 尝试取上下文中第一条有意义的行
  for (const line of lines) {
    if (!isNoiseLine(line)) {
      const cleaned = cleanTitle(line);
      if (cleaned) return { suggestedTitle: cleaned, source: 'context-first-meaningful' };
    }
  }

  // 6) 最终回退
  return { suggestedTitle: '未命名资源', source: 'fallback' };
}

export default { extractCandidateTitle };
