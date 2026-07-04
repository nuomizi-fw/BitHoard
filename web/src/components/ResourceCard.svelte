<script>
    import { link } from "svelte-routing";
    import { api } from "../lib/api.js";
    import {
        Star,
        Tag,
        Download as DownloadIcon,
        MoreVertical,
    } from "lucide-svelte";
    import { createEventDispatcher } from "svelte";

    export let resource;
    export let mode = "list";

    const dispatch = createEventDispatcher();

    $: statusLabel =
        {
            draft: "待完善",
            active: "已入库",
            downloaded: "已下载",
            deleted: "已删除",
        }[resource.status] || resource.status;

    $: statusClass = resource.status;

    $: screenshotUrl =
        resource.screenshot_count > 0 && resource.first_screenshot_id
            ? api.getScreenshotUrl(resource.id, resource.first_screenshot_id)
            : null;

    function formatDate(dateStr) {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        return d.toLocaleDateString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function starArray(rating) {
        return Array.from({ length: 5 }, (_, i) => i < rating);
    }
</script>

{#if mode === "list"}
    <a href={`/resource/${resource.id}`} use:link class="resource-row">
        <div class="row-main">
            <div class="row-title">
                {resource.title || "未命名资源"}
            </div>
            <div class="row-meta">
                <span class="source">{resource.source_app}</span>
                <span class="separator">·</span>
                <span class="date">{formatDate(resource.updated_at)}</span>
                <span class="separator">·</span>
                <span class={`status ${statusClass}`}>{statusLabel}</span>
            </div>
        </div>
        <div class="row-rating">
            {#each starArray(resource.rating) as filled, i}
                <span class:filled><Star size={12} /></span>
            {/each}
        </div>
        <div class="row-actions">
            {#if resource.screenshot_count > 0}
                <span class="img-badge">📷 {resource.screenshot_count}</span>
            {/if}
        </div>
    </a>
{:else}
    <a href={`/resource/${resource.id}`} use:link class="resource-card">
        <div class="card-preview">
            {#if screenshotUrl}
                <img src={screenshotUrl} alt="" class="card-img" />
            {:else}
                <div class="card-placeholder">🧲</div>
            {/if}
        </div>
        <div class="card-body">
            <h4>{resource.title || "未命名资源"}</h4>
            <p class="card-desc">{resource.description || "暂无描述"}</p>
            <div class="card-meta">
                <span class={`status ${statusClass}`}>{statusLabel}</span>
                <span>{resource.source_app}</span>
            </div>
            <div class="card-rating">
                {#each starArray(resource.rating) as filled, i}
                    <span class:filled><Star size={14} /></span>
                {/each}
            </div>
        </div>
    </a>
{/if}

<style>
    /* List mode */
    .resource-row {
        display: flex;
        align-items: center;
        padding: 14px 16px;
        background: #141414;
        border-radius: 8px;
        text-decoration: none;
        color: inherit;
        transition: background 0.15s;
    }

    .resource-row:hover {
        background: #1e1e1e;
    }

    .row-main {
        flex: 1;
    }

    .row-title {
        font-size: 14px;
        font-weight: 600;
        color: #e0e0e0;
        margin-bottom: 4px;
    }

    .row-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #666;
    }

    .separator {
        color: #444;
    }

    .source {
        color: #555;
    }

    .status {
        padding: 1px 8px;
        border-radius: 4px;
        font-size: 11px;
    }

    .status.draft {
        background: #3a3a1a;
        color: #a0a000;
    }
    .status.active {
        background: #1a3a1a;
        color: #00a000;
    }
    .status.downloaded {
        background: #1a1a3a;
        color: #6366f1;
    }
    .status.deleted {
        background: #3a1a1a;
        color: #a00000;
    }

    .row-rating {
        display: flex;
        gap: 2px;
        margin: 0 24px;
    }

    .row-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .img-badge {
        font-size: 12px;
        color: #666;
    }

    /* Card mode */
    .resource-card {
        background: #141414;
        border-radius: 12px;
        overflow: hidden;
        text-decoration: none;
        color: inherit;
        transition: all 0.15s;
        border: 1px solid #1e1e1e;
    }

    .resource-card:hover {
        border-color: #333;
        transform: translateY(-2px);
    }

    .card-preview {
        height: 160px;
        background: #1a1a1a;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .card-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .card-placeholder {
        font-size: 48px;
        opacity: 0.3;
    }

    .card-body {
        padding: 14px;
    }

    .card-body h4 {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 6px;
        color: #e0e0e0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .card-desc {
        font-size: 12px;
        color: #666;
        margin-bottom: 10px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .card-meta {
        display: flex;
        gap: 8px;
        font-size: 11px;
        color: #555;
        margin-bottom: 8px;
    }

    .card-rating {
        display: flex;
        gap: 2px;
    }

    :global(.filled) {
        fill: #f59e0b;
        color: #f59e0b;
    }
</style>
