<script>
    import { onMount } from "svelte";
    import { resources } from "../lib/stores/resources.js";
    import { viewMode } from "../lib/stores/ui.js";
    import ResourceCard from "../components/ResourceCard.svelte";
    import SearchBar from "../components/SearchBar.svelte";
    import { api } from "../lib/api.js";
    import { showToast } from "../lib/stores/ui.js";
    import { LayoutGrid, List, Plus, X } from "lucide-svelte";

    let loading = true;
    let showAddDialog = false;
    let pasteText = "";
    let adding = false;

    onMount(() => {
        resources
            .fetch({ is_deleted: 0, limit: 50 })
            .finally(() => (loading = false));
    });

    function handleSearch(e) {
        const q = e.detail || e.target?.value;
        if (q) {
            resources.fetch({ search: q, is_deleted: 0 });
        } else {
            resources.fetch({ is_deleted: 0 });
        }
    }

    function extractMagnetLinks(text) {
        const re = /magnet:\?[^\s<>"]+/gi;
        return [...text.matchAll(re)].map((m) => ({
            uri: m[0],
            type: "magnet",
        }));
    }

    async function handleAddResources() {
        const links = extractMagnetLinks(pasteText);
        if (links.length === 0) {
            showToast({
                type: "error",
                message: "未检测到磁链，请粘贴包含 magnet:? 的链接",
            });
            return;
        }

        adding = true;
        try {
            const result = await api.createResources({
                links,
                sourceApp: "手动录入",
            });

            let createdCount = 0;
            for (const r of result.results) {
                if (r.created) {
                    createdCount++;
                    await api.updateResource(r.id, { status: "active" });
                }
            }

            resources.refresh();
            showToast({
                type: "success",
                message: `成功添加 ${createdCount} 个资源`,
            });
            pasteText = "";
            showAddDialog = false;
        } catch (err) {
            showToast({ type: "error", message: "添加失败: " + err.message });
        } finally {
            adding = false;
        }
    }
</script>

<div class="home-page">
    <div class="page-header">
        <div class="header-left">
            <h2>全部资源</h2>
            <span class="count">{$resources.total} 条</span>
        </div>
        <div class="header-right">
            <SearchBar on:search={handleSearch} />
            <button class="btn-add" on:click={() => (showAddDialog = true)}>
                <Plus size={16} />
                添加资源
            </button>
            <div class="view-toggle">
                <button
                    class:active={$viewMode === "list"}
                    on:click={() => viewMode.set("list")}
                >
                    <List size={16} />
                </button>
                <button
                    class:active={$viewMode === "card"}
                    on:click={() => viewMode.set("card")}
                >
                    <LayoutGrid size={16} />
                </button>
            </div>
        </div>
    </div>

    {#if loading}
        <div class="loading">加载中...</div>
    {:else if $resources.items.length === 0}
        <div class="empty">
            <p>还没有资源</p>
            <p class="hint">
                复制一个磁链后 <kbd>Ctrl+V</kbd> 直接粘贴，或点击右上角"添加资源"
            </p>
        </div>
    {:else}
        <div class="resource-grid" class:card-mode={$viewMode === "card"}>
            {#each $resources.items as item (item.id)}
                <ResourceCard resource={item} mode={$viewMode} />
            {/each}
        </div>
    {/if}
</div>

{#if showAddDialog}
    <div class="dialog-overlay" on:click|self={() => (showAddDialog = false)}>
        <div class="dialog">
            <div class="dialog-header">
                <h3>添加资源</h3>
                <button
                    class="btn-close"
                    on:click={() => (showAddDialog = false)}
                >
                    <X size={18} />
                </button>
            </div>
            <div class="dialog-body">
                <p class="dialog-hint">
                    粘贴一个或多个磁链（magnet:?），每行一个
                </p>
                <textarea
                    bind:value={pasteText}
                    placeholder="magnet:?xt=urn:btih:..."
                    rows="6"
                    autofocus
                ></textarea>
            </div>
            <div class="dialog-footer">
                <button
                    class="btn-cancel"
                    on:click={() => (showAddDialog = false)}
                >
                    取消
                </button>
                <button
                    class="btn-submit"
                    on:click={handleAddResources}
                    disabled={adding || !pasteText.trim()}
                >
                    {adding ? "添加中..." : "添加"}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .home-page {
        max-width: 1400px;
        margin: 0 auto;
    }

    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        gap: 16px;
        flex-wrap: wrap;
    }

    .header-left {
        display: flex;
        align-items: baseline;
        gap: 12px;
    }

    .header-left h2 {
        font-size: 24px;
        font-weight: 700;
        color: #e0e0e0;
    }

    .count {
        font-size: 13px;
        color: #666;
    }

    .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .view-toggle {
        display: flex;
        background: #1a1a1a;
        border-radius: 8px;
        overflow: hidden;
    }

    .view-toggle button {
        background: none;
        border: none;
        color: #666;
        padding: 8px;
        cursor: pointer;
        display: flex;
    }

    .view-toggle button.active {
        background: #2a2a2a;
        color: #6366f1;
    }

    .view-toggle button:hover:not(.active) {
        color: #aaa;
    }

    .resource-grid {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .resource-grid.card-mode {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
    }

    .loading,
    .empty {
        text-align: center;
        padding: 60px 20px;
        color: #666;
    }

    .empty .hint {
        font-size: 13px;
        margin-top: 8px;
        color: #444;
    }

    .empty .hint kbd {
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 1px 6px;
        font-size: 12px;
        color: #aaa;
        font-family: inherit;
    }

    .btn-add {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #6366f1;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.15s;
    }

    .btn-add:hover {
        background: #5558e6;
    }

    /* Dialog */
    .dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .dialog {
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 12px;
        width: 520px;
        max-width: 90vw;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    }

    .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px 0;
    }

    .dialog-header h3 {
        font-size: 18px;
        color: #e0e0e0;
    }

    .btn-close {
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
    }

    .btn-close:hover {
        color: #aaa;
        background: #2a2a2a;
    }

    .dialog-body {
        padding: 16px 24px;
    }

    .dialog-hint {
        font-size: 13px;
        color: #666;
        margin-bottom: 12px;
    }

    .dialog-body textarea {
        width: 100%;
        background: #121212;
        border: 1px solid #333;
        border-radius: 8px;
        color: #e0e0e0;
        font-size: 13px;
        font-family: "Consolas", "Courier New", monospace;
        padding: 12px;
        resize: vertical;
        outline: none;
        box-sizing: border-box;
    }

    .dialog-body textarea:focus {
        border-color: #6366f1;
    }

    .dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 0 24px 20px;
    }

    .btn-cancel {
        background: #2a2a2a;
        color: #aaa;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 8px 20px;
        font-size: 14px;
        cursor: pointer;
    }

    .btn-cancel:hover {
        background: #333;
        color: #e0e0e0;
    }

    .btn-submit {
        background: #6366f1;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 8px 20px;
        font-size: 14px;
        cursor: pointer;
    }

    .btn-submit:hover:not(:disabled) {
        background: #5558e6;
    }

    .btn-submit:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
