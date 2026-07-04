<script>
    import { stagingExpanded } from "../lib/stores/ui.js";
    import { stagingResources } from "../lib/stores/resources.js";
    import { ChevronDown, ChevronUp, Package } from "lucide-svelte";

    let expanded = false;
    stagingExpanded.subscribe((v) => (expanded = v));
</script>

{#if $stagingResources.length > 0}
    <div class="staging-area" class:expanded>
        <button
            class="staging-toggle"
            on:click={() => stagingExpanded.update((v) => !v)}
        >
            <Package size={16} />
            <span>暂存区 ({$stagingResources.length})</span>
            {#if expanded}
                <ChevronDown size={14} />
            {:else}
                <ChevronUp size={14} />
            {/if}
        </button>

        {#if expanded}
            <div class="staging-list">
                {#each $stagingResources as res}
                    <div class="staging-item">
                        <span class="staging-uri"
                            >{res.magnet_uri?.substring(0, 60)}...</span
                        >
                        <span class="staging-source">{res.source_app}</span>
                        <span class="staging-status draft">待处理</span>
                        <button class="btn-edit">编辑</button>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
{/if}

<style>
    .staging-area {
        position: fixed;
        bottom: 0;
        left: 240px;
        right: 0;
        background: #1a1a1a;
        border-top: 1px solid #333;
        z-index: 999;
        transition: all 0.2s;
    }

    .staging-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 24px;
        background: #252525;
        border: none;
        color: #aaa;
        width: 100%;
        cursor: pointer;
        font-size: 13px;
    }

    .staging-toggle:hover {
        background: #2a2a2a;
        color: #fff;
    }

    .staging-list {
        max-height: 200px;
        overflow-y: auto;
        padding: 8px 24px;
    }

    .staging-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid #222;
    }

    .staging-uri {
        font-size: 12px;
        color: #6366f1;
        font-family: monospace;
        flex: 1;
    }

    .staging-source {
        font-size: 11px;
        color: #666;
    }

    .staging-status {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
    }

    .staging-status.draft {
        background: #3a3a1a;
        color: #a0a000;
    }

    .btn-edit {
        background: #6366f1;
        border: none;
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
    }

    .btn-edit:hover {
        background: #5558e6;
    }
</style>
