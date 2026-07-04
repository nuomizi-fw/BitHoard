<script>
    import { onMount } from "svelte";
    import { link, navigate } from "svelte-routing";
    import { api } from "../lib/api.js";
    import {
        Star,
        ArrowLeft,
        Download as DownloadIcon,
        Trash2,
        Tag,
        FolderOpen,
    } from "lucide-svelte";
    import { showToast } from "../lib/stores/ui.js";

    export let id;
    let resource = null;
    let loading = true;
    let editing = false;
    let editTitle = "";
    let editDescription = "";
    let editRating = 0;
    let editReview = "";

    onMount(async () => {
        try {
            resource = await api.getResource(id);
            editTitle = resource.title || "";
            editDescription = resource.description || "";
            editRating = resource.rating || 0;
            editReview = resource.review || "";
        } catch (err) {
            showToast({ type: "error", message: "加载失败" });
        } finally {
            loading = false;
        }
    });

    async function saveEdit() {
        try {
            await api.updateResource(id, {
                title: editTitle,
                description: editDescription,
                rating: editRating,
                review: editReview,
            });
            resource = await api.getResource(id);
            editing = false;
            showToast({ type: "info", message: "已保存" });
        } catch (err) {
            showToast({ type: "error", message: "保存失败" });
        }
    }

    async function handleDelete() {
        if (!confirm("确定要删除吗？")) return;
        await api.deleteResource(id);
        navigate("/");
    }

    async function handleDownload() {
        try {
            await api.createDownload({
                resource_id: id,
                start_paused: false,
            });
            showToast({ type: "info", message: "已添加到下载队列" });
            resource = await api.getResource(id);
        } catch (err) {
            showToast({ type: "error", message: "下载失败: " + err.message });
        }
    }

    async function handlePasteScreenshot(e) {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                const blob = item.getAsFile();
                const buffer = await blob.arrayBuffer();
                await api.uploadScreenshot(id, new Uint8Array(buffer));
                resource = await api.getResource(id);
                showToast({ type: "info", message: "截图已上传" });
            }
        }
    }

    function formatSize(bytes) {
        if (!bytes) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return `${size.toFixed(1)} ${units[i]}`;
    }
</script>

{#if loading}
    <div class="loading">加载中...</div>
{:else if !resource}
    <div class="error">资源不存在</div>
{:else}
    <div class="detail-page">
        <div class="detail-header">
            <a href="/" use:link class="back-btn"><ArrowLeft size={18} /></a>
            <div class="header-content">
                {#if editing}
                    <input
                        type="text"
                        bind:value={editTitle}
                        class="edit-title"
                        placeholder="输入标题..."
                    />
                {:else}
                    <h2>{resource.title || "未命名资源"}</h2>
                {/if}
                <div class="header-meta">
                    <span class="source">来源: {resource.source_app}</span>
                    <span class="separator">·</span>
                    <span>{resource.category}</span>
                    <span class="separator">·</span>
                    <span class={`status ${resource.status}`}
                        >{resource.status}</span
                    >
                </div>
            </div>
            <div class="header-actions">
                <button on:click={handleDownload} class="btn btn-accent"
                    ><DownloadIcon size={16} /> 下载</button
                >
                {#if editing}
                    <button on:click={saveEdit} class="btn btn-primary"
                        >保存</button
                    >
                    <button
                        on:click={() => (editing = false)}
                        class="btn btn-secondary">取消</button
                    >
                {:else}
                    <button
                        on:click={() => (editing = true)}
                        class="btn btn-secondary">编辑</button
                    >
                {/if}
                <button on:click={handleDelete} class="btn btn-danger"
                    ><Trash2 size={16} /></button
                >
            </div>
        </div>

        <div class="detail-body">
            <div class="detail-main">
                <!-- 描述 -->
                <section class="section">
                    <h3>描述</h3>
                    {#if editing}
                        <textarea
                            bind:value={editDescription}
                            placeholder="输入描述..."
                            rows="4"
                        />
                    {:else}
                        <p>{resource.description || "暂无描述"}</p>
                    {/if}
                </section>

                <!-- 磁链 -->
                <section class="section">
                    <h3>磁链</h3>
                    <code class="magnet-uri">{resource.magnet_uri}</code>
                </section>

                <!-- 评价 -->
                <section class="section">
                    <h3>评价</h3>
                    <div class="rating-stars">
                        {#each Array(5) as _, i}
                            <button
                                class="star-btn"
                                class:filled={i <
                                    (editing ? editRating : resource.rating)}
                                disabled={!editing}
                                on:click={() => (editRating = i + 1)}
                            >
                                <Star
                                    size={24}
                                    fill={i <
                                    (editing ? editRating : resource.rating)
                                        ? "currentColor"
                                        : "none"}
                                />
                            </button>
                        {/each}
                    </div>
                    {#if editing}
                        <textarea
                            bind:value={editReview}
                            placeholder="输入评价..."
                            rows="3"
                            style="margin-top: 12px;"
                        />
                    {:else if resource.review}
                        <p class="review">{resource.review}</p>
                    {/if}
                </section>

                <!-- 截图 -->
                <section class="section">
                    <h3>截图 ({resource.screenshots?.length || 0})</h3>
                    <div
                        class="screenshot-upload"
                        contenteditable="true"
                        on:paste={handlePasteScreenshot}
                        tabindex="0"
                    >
                        点击此处后 Ctrl+V 粘贴截图
                    </div>
                    <div class="screenshots-grid">
                        {#each resource.screenshots || [] as shot}
                            <div class="screenshot-item">
                                <img
                                    src={api.getScreenshotUrl(
                                        id,
                                        shot.id,
                                    )}
                                    alt=""
                                    loading="lazy"
                                />
                            </div>
                        {/each}
                    </div>
                </section>

                <!-- 文件列表 -->
                {#if resource.files?.length > 0}
                    <section class="section">
                        <h3>文件列表 ({resource.files.length})</h3>
                        <div class="file-list">
                            {#each resource.files as file}
                                <div class="file-item">
                                    <span class="file-path"
                                        >{file.file_path}</span
                                    >
                                    <span class="file-size"
                                        >{formatSize(file.file_size)}</span
                                    >
                                </div>
                            {/each}
                        </div>
                    </section>
                {/if}

                <!-- 标签 -->
                <section class="section">
                    <h3>标签</h3>
                    <div class="tag-list">
                        {#each resource.tags || [] as tag}
                            <span
                                class="tag"
                                style="background: {tag.color}22; color: {tag.color}; border-color: {tag.color}44;"
                            >
                                {tag.name}
                            </span>
                        {/each}
                    </div>
                </section>
            </div>

            <div class="detail-sidebar">
                <!-- 下载状态 -->
                {#if resource.download}
                    <section class="sidebar-section">
                        <h3>下载状态</h3>
                        <div class="dl-info">
                            <span
                                >状态: {resource.download.download_status}</span
                            >
                            <span
                                >大小: {formatSize(
                                    resource.download.total_size,
                                )}</span
                            >
                            <span
                                >路径: {resource.download.download_path ||
                                    "默认"}</span
                            >
                        </div>
                    </section>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .detail-page {
        max-width: 1200px;
        margin: 0 auto;
    }

    .detail-header {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 32px;
    }

    .back-btn {
        color: #888;
        margin-top: 4px;
    }

    .back-btn:hover {
        color: #fff;
    }

    .header-content {
        flex: 1;
    }

    .header-content h2 {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 6px;
    }

    .edit-title {
        font-size: 24px;
        font-weight: 700;
        background: #1a1a1a;
        border: 1px solid #333;
        color: #e0e0e0;
        padding: 8px 12px;
        border-radius: 8px;
        width: 100%;
        margin-bottom: 6px;
        outline: none;
    }

    .edit-title:focus {
        border-color: #6366f1;
    }

    .header-meta {
        display: flex;
        gap: 8px;
        font-size: 13px;
        color: #666;
    }

    .header-actions {
        display: flex;
        gap: 8px;
    }

    .btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 18px;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
    }

    .btn-primary {
        background: #6366f1;
        color: white;
    }
    .btn-primary:hover {
        background: #5558e6;
    }
    .btn-accent {
        background: #059669;
        color: white;
    }
    .btn-accent:hover {
        background: #047857;
    }
    .btn-secondary {
        background: #2a2a2a;
        color: #aaa;
    }
    .btn-secondary:hover {
        background: #3a3a3a;
    }
    .btn-danger {
        background: #3a1a1a;
        color: #ef4444;
    }
    .btn-danger:hover {
        background: #4a1a1a;
    }

    .detail-body {
        display: grid;
        grid-template-columns: 1fr 300px;
        gap: 32px;
    }

    .section {
        margin-bottom: 28px;
    }

    .section h3 {
        font-size: 14px;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        margin-bottom: 12px;
    }

    .section p,
    .section textarea {
        font-size: 14px;
        color: #aaa;
        line-height: 1.6;
    }

    .section textarea {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 12px;
        color: #e0e0e0;
        width: 100%;
        resize: vertical;
        outline: none;
    }

    .section textarea:focus {
        border-color: #6366f1;
    }

    .magnet-uri {
        display: block;
        font-size: 12px;
        color: #6366f1;
        word-break: break-all;
        background: #0a0a0a;
        padding: 12px;
        border-radius: 8px;
    }

    .rating-stars {
        display: flex;
        gap: 4px;
    }

    .star-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #444;
        padding: 0;
    }

    .star-btn:disabled {
        cursor: default;
    }

    .star-btn.filled {
        color: #f59e0b;
    }

    .screenshot-upload {
        border: 2px dashed #333;
        border-radius: 8px;
        padding: 20px;
        text-align: center;
        color: #666;
        font-size: 13px;
        cursor: text;
        margin-bottom: 12px;
    }

    .screenshot-upload:focus {
        border-color: #6366f1;
    }

    .screenshots-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 12px;
    }

    .screenshot-item {
        border-radius: 8px;
        overflow: hidden;
        background: #1a1a1a;
    }

    .screenshot-item img {
        width: 100%;
        height: 150px;
        object-fit: cover;
    }

    .file-list {
        background: #0a0a0a;
        border-radius: 8px;
        overflow: hidden;
    }

    .file-item {
        display: flex;
        justify-content: space-between;
        padding: 10px 16px;
        border-bottom: 1px solid #1a1a1a;
        font-size: 13px;
    }

    .file-path {
        color: #aaa;
    }
    .file-size {
        color: #666;
        font-family: monospace;
    }

    .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .tag {
        padding: 4px 12px;
        border-radius: 6px;
        border: 1px solid;
        font-size: 12px;
    }

    .dl-info {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 13px;
        color: #aaa;
    }

    .sidebar-section {
        background: #141414;
        border: 1px solid #222;
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 16px;
    }

    .sidebar-section h3 {
        font-size: 12px;
        color: #888;
        margin-bottom: 10px;
    }

    .review {
        margin-top: 12px;
        font-style: italic;
        color: #888;
    }
</style>
