/**
 * 从文本中提取所有磁链（magnet URI）和 BTIH hash。
 * 支持格式：
 *   - 标准 magnet:?xt=urn:btih:... 链接
 *   - 截断磁链（hash&dn=...）
 *   - 纯 Base32 BTIH hash（32位）
 *   - 纯十六进制 BTIH hash（40位）
 *   - 夹杂干扰字符的散落 hash
 *
 * @param {string} text 待解析文本
 * @returns {{ uri: string, type: "magnet" }[]}
 */
export function extractMagnetLinks(text) {
    const results = [];
    const seenHash = new Set();

    // 1) 标准 magnet:? 链接
    const magnetRe = /magnet:\?xt=urn:btih:(?:[a-fA-F0-9]{40}|[A-Z2-7a-z2-7]{32})(?:&[a-zA-Z]+=[^&\r\n]+)*/gi;
    for (const m of text.matchAll(magnetRe)) {
        results.push({ uri: m[0], type: "magnet" });
        // 记录 BTIH 防重复（支持十六进制和 Base32）
        const h = m[0].match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
        if (h) seenHash.add(h[1].toLowerCase());
    }

    // 2) 截断磁链（hash&dn=xxx&xl=xxx），补全为完整 magnet URI
    const truncatedRe = /\b([A-Z2-7a-z2-7]{32}|[a-fA-F0-9]{40})(?:&[a-z]+=[^&\s<>"]+)+\b/gi;
    for (const m of text.matchAll(truncatedRe)) {
        const uri = "magnet:?xt=urn:btih:" + m[0];
        results.push({ uri, type: "magnet" });
        const h = uri.match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
        if (h) seenHash.add(h[1].toLowerCase());
    }

    // 3) 纯 Base32 BTIH hash（32位），自动构造 magnet URI
    const base32Re = /\b([A-Z2-7a-z2-7]{32})\b/g;
    for (const m of text.matchAll(base32Re)) {
        const lower = m[1].toLowerCase();
        if (!seenHash.has(lower)) {
            seenHash.add(lower);
            results.push({ uri: `magnet:?xt=urn:btih:${lower}`, type: "magnet" });
        }
    }

    // 4) 纯十六进制 BTIH hash（40位），自动构造 magnet URI
    const hashRe = /\b([a-fA-F0-9]{40})\b/g;
    for (const m of text.matchAll(hashRe)) {
        const lower = m[1].toLowerCase();
        if (!seenHash.has(lower)) {
            seenHash.add(lower);
            results.push({ uri: `magnet:?xt=urn:btih:${lower}`, type: "magnet" });
        }
    }

    // 5) 干扰字符滤除：先清理已被步骤1-4匹配的已知文本，再对剩余文本提取散落hash
    let cleanedText = text;
    for (const r of results) {
        cleanedText = cleanedText.split(r.uri).join('');
    }
    cleanedText = cleanedText.replace(magnetRe, '');

    const hexOnly = cleanedText.replace(/[^a-fA-F0-9]/g, '');
    for (let i = 0; i <= hexOnly.length - 40; i++) {
        const candidate = hexOnly.substring(i, i + 40);
        if (/^[a-fA-F0-9]{40}$/.test(candidate)) {
            const lower = candidate.toLowerCase();
            if (!seenHash.has(lower)) {
                seenHash.add(lower);
                results.push({ uri: `magnet:?xt=urn:btih:${lower}`, type: "magnet" });
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
                results.push({ uri: `magnet:?xt=urn:btih:${lower}`, type: "magnet" });
            }
            i += 31;
        }
    }

    return results;
}
