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

    // 检测文本中的磁链
    function extractMagnetLinks(text) {
        const re = /magnet:\?[^\s<>"]+/gi;
        const matches = [...text.matchAll(re)];
        return matches.map((m) => ({ uri: m[0], type: "magnet" }));
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
