<script>
    import { link } from "svelte-routing";
    import { api } from "../lib/api.js";
    import {
        Star,
        Video,
    } from "lucide-svelte";
    import { formatDate } from "../lib/format.js";
    import { STATUS_LABELS } from "../lib/constants.js";

    export let resource;
    export let mode = "list";

    const MAX_PREVIEWS = 4;
    const MAX_TAGS = 3;

    $: statusLabel = STATUS_LABELS[resource.status] || resource.status;
    $: statusClass = resource.status;

    // 截图预览 URL 列表（最多 4 张）
    $: screenshotIds = resource.screenshot_ids || [];
    $: screenshotPreviews = screenshotIds.slice(0, MAX_PREVIEWS).map(id =>
        api.getScreenshotUrl(resource.id, id, 'thumb')
    );

    // 视频预览（第一段视频作为缩略图指示）
    $: videoPreviewUrl = resource.first_video_id
        ? api.getVideoUrl(resource.id, resource.first_video_id)
        : null;
    $: videoCount = resource.video_count || 0;

    // 总预览数 = 截图 + 是否有视频
    $: totalPreviewCount = screenshotIds.length + (videoCount > 0 ? 1 : 0);
    $: morePreviewCount = Math.max(0, totalPreviewCount - MAX_PREVIEWS);

    // 标签（最多 3 个）
    $: tags = resource.tags || [];
    $: displayTags = tags.slice(0, MAX_TAGS);
    $: moreTagCount = Math.max(0, tags.length - MAX_TAGS);

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
                {#each displayTags as tag}
                    <span class="separator">·</span>
                    <span
                        class="tag-pill"
                        style="background:{tag.color}22;color:{tag.color};border-color:{tag.color}44;"
                    >{tag.name}</span>
                {/each}
                {#if moreTagCount > 0}
                    <span class="separator">·</span>
                    <span class="tag-pill tag-more">+{moreTagCount}</span>
                {/if}
            </div>
        </div>
        <!-- 预览缩略图 -->
        <div class="row-previews">
            {#each screenshotPreviews as url}
                <img src={url} alt="" class="preview-thumb" loading="lazy" />
            {/each}
            {#if videoPreviewUrl && screenshotPreviews.length < MAX_PREVIEWS}
                <div class="preview-thumb preview-video">
                    <Video size={14} />
                </div>
            {/if}
            {#if morePreviewCount > 0}
                <span class="preview-more">+{morePreviewCount}</span>
            {/if}
            {#if screenshotPreviews.length === 0 && !videoPreviewUrl}
                <span class="preview-placeholder">🧲</span>
            {/if}
        </div>
        <div class="row-rating">
            {#each starArray(resource.rating) as filled, i}
                <span class:filled><Star size={12} /></span>
            {/each}
        </div>
    </a>
{:else}
    <a href={`/resource/${resource.id}`} use:link class="resource-card">
        <div class="card-preview">
            {#if screenshotPreviews.length > 0}
                <div class="card-preview-grid">
                    {#each screenshotPreviews as url}
                        <img src={url} alt="" class="card-preview-img" loading="lazy" />
                    {/each}
                    {#if videoPreviewUrl && screenshotPreviews.length < MAX_PREVIEWS}
                        <div class="card-preview-img card-preview-video">
                            <Video size={20} />
                        </div>
                    {/if}
                </div>
            {:else if videoPreviewUrl}
                <div class="card-preview-single">
                    <Video size={32} />
                </div>
            {:else}
                <div class="card-placeholder">🧲</div>
            {/if}
        </div>
        <div class="card-body">
            <h4>{resource.title || "未命名资源"}</h4>
            <p class="card-desc">{resource.description || "暂无描述"}</p>
            <!-- 标签 -->
            {#if displayTags.length > 0}
                <div class="card-tags">
                    {#each displayTags as tag}
                        <span
                            class="tag-pill"
                            style="background:{tag.color}22;color:{tag.color};border-color:{tag.color}44;"
                        >{tag.name}</span>
                    {/each}
                    {#if moreTagCount > 0}
                        <span class="tag-pill tag-more">+{moreTagCount}</span>
                    {/if}
                </div>
            {/if}
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
    /* ====== 公共 ====== */
    .separator { color: #444; }
    .source { color: #555; }

    .status {
        padding: 1px 8px;
        border-radius: 4px;
        font-size: 11px;
    }
    .status.draft { background: #3a3a1a; color: #a0a000; }
    .status.active { background: #1a3a1a; color: #00a000; }
    .status.downloaded { background: #1a1a3a; color: #6366f1; }
    .status.deleted { background: #3a1a1a; color: #a00000; }

    /* 标签 pills */
    .tag-pill {
        display: inline-block;
        padding: 1px 8px;
        border-radius: 10px;
        font-size: 11px;
        border: 1px solid;
        white-space: nowrap;
    }
    .tag-more {
        background: #2a2a2a !important;
        color: #888 !important;
        border-color: #3a3a3a !important;
    }

    /* 预览缩略图 */
    .preview-thumb {
        width: 36px;
        height: 36px;
        border-radius: 4px;
        object-fit: cover;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        flex-shrink: 0;
    }
    .preview-video {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6366f1;
    }
    .preview-more {
        font-size: 11px;
        color: #888;
        flex-shrink: 0;
    }
    .preview-placeholder {
        font-size: 24px;
        opacity: 0.3;
        flex-shrink: 0;
    }

    /* ====== List mode ====== */
    .resource-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #141414;
        border-radius: 8px;
        text-decoration: none;
        color: inherit;
        transition: background 0.15s;
    }
    .resource-row:hover { background: #1e1e1e; }

    .row-previews {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }

    .row-main { flex: 1; min-width: 0; }

    .row-title {
        font-size: 14px;
        font-weight: 600;
        color: #e0e0e0;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .row-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #666;
        flex-wrap: wrap;
    }

    .row-rating {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
    }

    /* ====== Card mode ====== */
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

    .card-preview-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: 2px;
        width: 100%;
        height: 100%;
    }

    .card-preview-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #1a1a1a;
    }
    .card-preview-video {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6366f1;
    }
    .card-preview-single {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6366f1;
        width: 100%;
        height: 100%;
    }

    .card-placeholder {
        font-size: 48px;
        opacity: 0.3;
    }

    .card-body { padding: 14px; }

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
        margin-bottom: 8px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .card-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-bottom: 8px;
    }

    .card-meta {
        display: flex;
        gap: 8px;
        font-size: 11px;
        color: #555;
        margin-bottom: 8px;
    }

    .card-rating { display: flex; gap: 2px; }

    :global(.filled) { fill: #f59e0b; color: #f59e0b; }
</style>
