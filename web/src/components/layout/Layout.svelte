<script>
    import { onMount } from "svelte";
    import { navigate } from "svelte-routing";
    import Sidebar from "./Sidebar.svelte";
    import ToastContainer from "../toast/ToastContainer.svelte";
    import StagingArea from "../StagingArea.svelte";
    import {
        stagingExpanded,
        sidebarCollapsed,
        showToast,
    } from "../../lib/stores/ui.js";
    import { resources } from "../../lib/stores/resources.js";
    import { api } from "../../lib/api.js";

    // 检测文本中的磁链（含纯 BTIH hash 自动识别）
    function extractMagnetLinks(text) {
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
        // 例如 "8C3DAB25中897A56F7B052F文3013AF删274671E掉4DF200" → 提取为有效 hash
        let cleanedText = text;
        // 移除已知的 URI，避免从 magnet:? 前缀中拼出假hash
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

    // Electron IPC: 监听剪贴板监控推送
    function setupElectronClipboardListener() {
        if (!window.electronAPI?.onClipboardDetected) return;

        window.electronAPI.onClipboardDetected((data) => {
            // Electron 剪贴板监控检测到链接，显示富交互 Toast
            showToast({
                type: "link-capture",
                persistent: true,
                links: data.links || [],
                sourceApp: data.sourceApp || "unknown",
                sourceProcess: data.sourceProcess || "",
                contextText: data.contextText || "",
                message:
                    data.links?.length > 1
                        ? `检测到 ${data.links.length} 个链接`
                        : "检测到磁链",
            });

            // 同步更新暂存区 (draft 入库由 Toast 按钮触发)
            stagingExpanded.set(data.links?.length > 1);
        });

        // 全局快捷键手动捕获（Ctrl+Shift+V）
        window.electronAPI.onShortcutCapture?.(async () => {
            let text = "";
            try {
                text = (await window.electronAPI.readClipboard?.()) || "";
            } catch {
                // 回退：浏览器 Clipboard API
                try { text = await navigator.clipboard.readText(); } catch {}
            }

            if (text) {
                const links = extractMagnetLinks(text);
                if (links.length > 0) {
                    showToast({
                        type: "link-capture",
                        persistent: true,
                        links,
                        sourceApp: "全局快捷键",
                        contextText: text,
                        message:
                            links.length > 1
                                ? `手动捕获 ${links.length} 个链接`
                                : "手动捕获磁链",
                    });
                } else {
                    showToast({
                        type: "info",
                        message: "剪贴板中未检测到链接",
                    });
                }
            } else {
                showToast({
                    type: "info",
                    message: "剪贴板为空或无法读取",
                });
            }
        });

        // 文件拖拽
        window.electronAPI.onFileDropped?.(async (results) => {
            for (const item of results) {
                if (item.type === "torrent") {
                    try {
                        const result = await api.importTorrent({
                            data: item.data,
                            name: item.name,
                            sourceApp: "文件拖拽",
                        });
                        if (result.created) {
                            resources.refresh();
                            showToast({
                                type: "success",
                                message: `种子 "${result.title}" 已导入`,
                            });
                        } else if (result.skipped) {
                            showToast({
                                type: "info",
                                message: "该种子对应的资源已存在",
                            });
                        }
                    } catch (err) {
                        showToast({
                            type: "error",
                            message: `种子导入失败: ${err.message}`,
                        });
                    }
                } else if (item.type === "text") {
                    const links = extractMagnetLinks(item.data);
                    if (links.length > 0) {
                        showToast({
                            type: "link-capture",
                            persistent: true,
                            links,
                            sourceApp: "文件拖拽",
                            contextText: item.data,
                            message:
                                links.length > 1
                                    ? `从文件检测到 ${links.length} 个链接`
                                    : "从文件检测到磁链",
                        });
                    }
                }
            }
        });
    }

    // 浏览器回退：全局粘贴 — 非输入框聚焦时检测磁链（仅在无 Electron 环境时使用）
    async function handlePaste(e) {
        // 如果已由 Electron 监控接管，跳过浏览器粘贴处理
        if (window.electronAPI) return;

        const active = document.activeElement;
        const isInput =
            active &&
            (active.tagName === "INPUT" ||
                active.tagName === "TEXTAREA" ||
                active.isContentEditable);
        if (isInput) return;

        let text = "";
        try {
            text = (await navigator.clipboard.readText()) || "";
        } catch {
            text = e.clipboardData?.getData("text/plain") || "";
        }

        const links = extractMagnetLinks(text);
        if (links.length === 0) return;

        e.preventDefault();

        // 浏览器环境：展示富交互 Toast
        showToast({
            type: "link-capture",
            persistent: true,
            links,
            sourceApp: "浏览器",
            contextText: text,
            message:
                links.length > 1
                    ? `检测到 ${links.length} 个链接`
                    : "检测到磁链",
        });
    }

    // 全局键盘快捷键
    function handleKeydown(e) {
        // Ctrl+K: 聚焦搜索
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
            e.preventDefault();
            navigate("/search", { replace: false });
            setTimeout(() => {
                const input = document.querySelector(
                    ".search-input-wrap input",
                );
                if (input) input.focus();
            }, 100);
        }
        // Escape: 关闭暂存区
        if (e.key === "Escape") {
            const active = document.activeElement;
            if (active && active.tagName === "INPUT") {
                active.blur();
            }
        }
    }

    onMount(() => {
        setupElectronClipboardListener();
        window.addEventListener("keydown", handleKeydown);
        window.addEventListener("paste", handlePaste);
        return () => {
            window.removeEventListener("keydown", handleKeydown);
            window.removeEventListener("paste", handlePaste);
        };
    });
</script>

<div class="app-layout">
    <Sidebar />
    <main class="main-content" class:collapsed={$sidebarCollapsed}>
        <div class="content-area">
            <slot />
        </div>
    </main>
</div>

<ToastContainer />
<StagingArea />

<style>
    .app-layout {
        display: flex;
        height: 100vh;
        overflow: hidden;
    }

    .main-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        margin-left: 240px;
        transition: margin-left 0.2s ease;
    }

    .main-content.collapsed {
        margin-left: 60px;
    }

    .content-area {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
    }
</style>
