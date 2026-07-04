<script>
    import { onMount } from "svelte";
    import { navigate } from "svelte-routing";
    import Sidebar from "./Sidebar.svelte";
    import ToastContainer from "./Toast/ToastContainer.svelte";
    import StagingArea from "./StagingArea.svelte";
    import {
        stagingExpanded,
        sidebarCollapsed,
        showToast,
    } from "../lib/stores/ui.js";
    import { resources } from "../lib/stores/resources.js";
    import { api } from "../lib/api.js";

    // 检测文本中的磁链
    function extractMagnetLinks(text) {
        const re = /magnet:\?[^\s<>"]+/gi;
        const matches = [...text.matchAll(re)];
        return matches.map((m) => ({ uri: m[0], type: "magnet" }));
    }

    // 全局粘贴 — 非输入框聚焦时检测磁链
    async function handlePaste(e) {
        const active = document.activeElement;
        const isInput =
            active &&
            (active.tagName === "INPUT" ||
                active.tagName === "TEXTAREA" ||
                active.isContentEditable);
        if (isInput) return; // 正常粘贴到输入框

        // 优先用 Clipboard API，回退到 paste 事件
        let text = "";
        try {
            text = (await navigator.clipboard.readText()) || "";
        } catch {
            text = e.clipboardData?.getData("text/plain") || "";
        }

        const links = extractMagnetLinks(text);
        if (links.length === 0) return;

        e.preventDefault();

        try {
            const result = await api.createResources({
                links,
                sourceApp: "浏览器",
            });

            let createdCount = 0;
            let skippedCount = 0;
            for (const r of result.results) {
                if (r.created) {
                    createdCount++;
                    await api.updateResource(r.id, {
                        status: "active",
                    });
                } else if (r.skipped) {
                    skippedCount++;
                }
            }

            resources.refresh();

            if (createdCount > 0 && skippedCount > 0) {
                showToast({
                    type: "success",
                    message: `成功添加 ${createdCount} 个资源，${skippedCount} 个已存在已跳过`,
                });
            } else if (createdCount > 0) {
                showToast({
                    type: "success",
                    message: `成功添加 ${createdCount} 个资源`,
                });
            } else {
                showToast({
                    type: "info",
                    message: `这 ${skippedCount} 个资源已存在，无需重复添加`,
                });
            }
        } catch (err) {
            showToast({
                type: "error",
                message: "添加失败: " + err.message,
            });
        }
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
