<script>
    import { stagingExpanded } from "../lib/stores/ui.js";
    import { stagingResources } from "../lib/stores/resources.js";
    import { ChevronDown, ChevronUp, Package, Check, Trash2, X } from "lucide-svelte";
    import { api } from "../lib/api.js";
    import { showToast } from "../lib/stores/ui.js";
    import { resources } from "../lib/stores/resources.js";

    let expanded = false;
    stagingExpanded.subscribe((v) => (expanded = v));

    let confirming = false;

    async function confirmItem(res, idx) {
        try {
            const result = await api.createResources({
                links: [{ uri: res.magnet_uri, type: "magnet" }],
                sourceApp: res.source_app || "暂存录入",
            });
            // 自动激活
            for (const r of result.results) {
                if (r.created) await api.updateResource(r.id, { status: "active" });
            }
            // 从暂存区移除
            stagingResources.update(items => items.filter((_, i) => i !== idx));
            resources.refresh();
            showToast({ type: "success", message: `"${res.title || res.magnet_uri?.substring(0, 40)}" 已入库` });
        } catch (err) {
            showToast({ type: "error", message: "入库失败: " + err.message });
        }
    }

    function removeItem(idx) {
        stagingResources.update(items => items.filter((_, i) => i !== idx));
    }

    async function confirmAll() {
        confirming = true;
        const items = [];
        stagingResources.subscribe(v => items.push(...v))();
        let done = 0;
        for (let i = items.length - 1; i >= 0; i--) {
            try {
                const res = items[i];
                const result = await api.createResources({
                    links: [{ uri: res.magnet_uri, type: "magnet" }],
                    sourceApp: res.source_app || "暂存录入",
                });
                for (const r of result.results) {
                    if (r.created) await api.updateResource(r.id, { status: "active" });
                }
                stagingResources.update(arr => arr.filter((_, j) => j !== i));
                done++;
            } catch (err) {
                // skip failed
            }
        }
        confirming = false;
        resources.refresh();
        showToast({ type: "success", message: `已入库 ${done} 个资源` });
    }

    function clearAll() {
        stagingResources.set([]);
    }
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
                {#each $stagingResources as res, idx (idx)}
                    <div class="staging-item">
                        <span class="staging-uri">{res.title || res.magnet_uri?.substring(0, 60)}{res.title ? '' : '...'}</span>
                        <span class="staging-source">{res.source_app || "手动"}</span>
                        <span class="staging-status draft">待处理</span>
                        <button class="btn-confirm" on:click={() => confirmItem(res, idx)} title="确认入库"><Check size={14} /></button>
                        <button class="btn-remove" on:click={() => removeItem(idx)} title="移除"><X size={14} /></button>
                    </div>
                {/each}
            </div>
            <div class="staging-actions">
                <button class="btn-confirm-all" on:click={confirmAll} disabled={confirming}>
                    {confirming ? "处理中..." : "全部入库"}
                </button>
                <button class="btn-clear-all" on:click={clearAll}>清空暂存区</button>
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

    .btn-confirm {
        background: #059669;
        border: none;
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
    }

    .btn-confirm:hover { background: #047857; }

    .btn-remove {
        background: #3a1a1a;
        border: none;
        color: #ef4444;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
    }

    .btn-remove:hover { background: #4a1a1a; }

    .staging-actions {
        display: flex;
        gap: 8px;
        padding: 10px 24px;
        border-top: 1px solid #222;
    }

    .btn-confirm-all {
        background: #059669;
        border: none;
        color: white;
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
    }

    .btn-confirm-all:hover { background: #047857; }
    .btn-confirm-all:disabled { opacity: 0.5; cursor: default; }

    .btn-clear-all {
        background: none;
        border: 1px solid #333;
        color: #666;
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
    }

    .btn-clear-all:hover { border-color: #ef4444; color: #ef4444; }
</style>
