<script>
    import { onMount } from "svelte";
    import { resources } from "../lib/stores/resources.js";
    import { viewMode } from "../lib/stores/ui.js";
    import ResourceCard from "../components/ResourceCard.svelte";
    import SearchBar from "../components/SearchBar.svelte";
    import { api } from "../lib/api.js";
    import { showToast } from "../lib/stores/ui.js";
    import { LayoutGrid, List, Plus } from "lucide-svelte";

    let loading = true;

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
</script>

<div class="home-page">
    <div class="page-header">
        <div class="header-left">
            <h2>全部资源</h2>
            <span class="count">{$resources.total} 条</span>
        </div>
        <div class="header-right">
            <SearchBar on:search={handleSearch} />
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
            <p class="hint">复制一个磁链或 .torrent 链接开始吧！</p>
        </div>
    {:else}
        <div class="resource-grid" class:card-mode={$viewMode === "card"}>
            {#each $resources.items as item (item.id)}
                <ResourceCard resource={item} mode={$viewMode} />
            {/each}
        </div>
    {/if}
</div>

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
</style>
