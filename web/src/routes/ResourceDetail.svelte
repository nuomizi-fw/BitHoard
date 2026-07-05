<script>
    import { onMount, onDestroy } from "svelte";
    import { link, navigate } from "svelte-routing";
    import { api } from "../lib/api.js";
    import {
        Star,
        ArrowLeft,
        Download as DownloadIcon,
        Trash2,
        Tag,
        FolderOpen,
        Plus,
        X,
        RefreshCw,
        Film,
        Search as SearchIcon,
        Image,
        Video,
    } from "lucide-svelte";
    import { showToast } from "../lib/stores/ui.js";
    import { formatFileSize } from "../lib/format.js";
    import {
        STATUS_LABELS,
        CATEGORY_OPTIONS,
        CATEGORY_LABELS,
        DEFAULT_TAG_COLOR,
    } from "../lib/constants.js";
    import { debounce } from "../lib/utils.js";

    export let id;
    let resource = null;
    let loading = true;
    let editing = false;
    let editTitle = "";
    let editDescription = "";
    let editRating = 0;
    let editReview = "";
    let editStatus = "";
    let editCategory = "";

    // 标签管理
    let allTags = [];
    let newTagName = "";
    let newTagColor = DEFAULT_TAG_COLOR;
    let showTagInput = false;

    // TMDB 元数据
    let tmdbResult = null;
    let tmdbSearching = false;
    let tmdbApplying = false;
    let tmdbQuery = "";
    let tmdbSearchResults = [];
    let tmdbSearchResultsLoading = false;

    // 视频粘贴（详情页）
    let videoUploading = false;

    onMount(async () => {
        try {
            resource = await api.getResource(id);
            syncEditFields();
            allTags = await api.getTags();
        } catch (err) {
            showToast({ type: "error", message: "加载失败" });
        } finally {
            loading = false;
        }
        // 全局监听粘贴事件，用于截图和视频上传
        document.addEventListener("paste", handlePaste, true);
    });

    onDestroy(() => {
        document.removeEventListener("paste", handlePaste, true);
    });

    function syncEditFields() {
        editTitle = resource.title || "";
        editDescription = resource.description || "";
        editRating = resource.rating || 0;
        editReview = resource.review || "";
        editStatus = resource.status || "draft";
        editCategory = resource.category || "";
    }

    function startEditing() {
        syncEditFields();
        editing = true;
    }

    async function saveEdit() {
        try {
            await api.updateResource(id, {
                title: editTitle,
                description: editDescription,
                rating: editRating,
                review: editReview,
                status: editStatus,
                category: editCategory,
            });
            resource = await api.getResource(id);
            editing = false;
            showToast({ type: "info", message: "已保存" });
        } catch (err) {
            showToast({ type: "error", message: "保存失败: " + err.message });
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

    // 全局粘贴捕获（详情页任意位置 Ctrl+V：截图/视频）
    function handlePaste(e) {
        // 不在输入框/文本域内拦截粘贴
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.kind !== "file") continue;

            // 截图：image/* 或空 type（Electron 中剪贴板图片）
            if (item.type.startsWith("image/") || item.type === "") {
                const blob = item.getAsFile();
                if (!blob) continue;

                e.preventDefault();
                e.stopPropagation();

                api.uploadScreenshot(id, blob)
                    .then(async () => {
                        resource = await api.getResource(id);
                        showToast({ type: "info", message: "截图已上传" });
                    })
                    .catch((err) => {
                        console.error("Screenshot upload error:", err);
                        showToast({ type: "error", message: "截图上传失败" });
                    });
                return;
            }

            // 视频：video/* 类型（文件管理器等直接复制文件）
            if (item.type.startsWith("video/")) {
                const blob = item.getAsFile();
                if (!blob) continue;

                e.preventDefault();
                e.stopPropagation();

                const reader = new FileReader();
                reader.onload = () =>
                    uploadPastedVideo(reader.result, blob.name);
                reader.readAsDataURL(blob);
                return;
            }
        }

        // 浏览器 paste 事件未拿到视频（QQ/微信视频通过 text/uri-list + HDROP 传递），
        // 通过 IPC 让主进程检测剪贴板原生格式作为兜底。
        if (window.electronAPI?.checkClipboardVideo) {
            e.preventDefault();
            e.stopPropagation();
            window.electronAPI
                .checkClipboardVideo()
                .then(async (result) => {
                    if (result?.dataUrl) {
                        await uploadPastedVideo(
                            result.dataUrl,
                            result.fileName,
                        );
                    }
                })
                .catch((err) => {
                    console.error("checkClipboardVideo IPC error:", err);
                });
        }
    }

    // 上传粘贴的视频（来自 onClipboardVideo 或 handlePaste）
    async function uploadPastedVideo(dataUrl, fileName) {
        if (videoUploading) return;
        videoUploading = true;
        try {
            const blob = dataUrlToBlob(dataUrl);
            await api.uploadVideo(id, blob, fileName);
            resource = await api.getResource(id);
            showToast({ type: "info", message: `视频 ${fileName} 已上传` });
        } catch (err) {
            console.error("Video upload error:", err);
            showToast({
                type: "error",
                message: "视频上传失败: " + err.message,
            });
        } finally {
            videoUploading = false;
        }
    }

    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(",");
        const mime =
            parts[0].match(/:(.*?);/)?.[1] || "application/octet-stream";
        const binary = atob(parts[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }

    // 截图/视频删除操作
    async function deleteScreenshot(screenshotId) {
        try {
            await api.deleteScreenshot(id, screenshotId);
            resource = await api.getResource(id);
            showToast({ type: "info", message: "截图已删除" });
        } catch (err) {
            showToast({
                type: "error",
                message: "删除截图失败: " + err.message,
            });
        }
    }

    async function deleteVideo(videoId) {
        if (!confirm("确定要删除该视频吗？")) return;
        try {
            await api.deleteVideo(id, videoId);
            resource = await api.getResource(id);
            showToast({ type: "info", message: "视频已删除" });
        } catch (err) {
            showToast({
                type: "error",
                message: "删除视频失败: " + err.message,
            });
        }
    }

    // 标签操作
    async function addTag(tagId) {
        try {
            await api.addTagToResource(id, tagId);
            resource = await api.getResource(id);
        } catch (err) {
            showToast({ type: "error", message: "添加标签失败" });
        }
    }

    async function removeTag(tagId) {
        try {
            await api.removeTagFromResource(id, tagId);
            resource = await api.getResource(id);
        } catch (err) {
            showToast({ type: "error", message: "移除标签失败" });
        }
    }

    async function createAndAddTag() {
        if (!newTagName.trim()) return;
        try {
            const tag = await api.createTag(newTagName.trim(), newTagColor);
            await api.addTagToResource(id, tag.id);
            allTags = await api.getTags();
            resource = await api.getResource(id);
            newTagName = "";
            showTagInput = false;
            showToast({ type: "info", message: "标签已创建并添加" });
        } catch (err) {
            showToast({ type: "error", message: "创建标签失败" });
        }
    }

    async function refreshFileCache() {
        try {
            await api.refreshFileCache(id);
            resource = await api.getResource(id);
            showToast({ type: "info", message: "文件缓存已刷新" });
        } catch (err) {
            showToast({ type: "error", message: "刷新失败" });
        }
    }

    // TMDB 操作
    async function matchTMDB() {
        tmdbSearching = true;
        tmdbResult = null;
        try {
            tmdbResult = await api.tmdbMatch(id);
        } catch (err) {
            showToast({
                type: "error",
                message: "TMDB匹配失败: " + err.message,
            });
        }
        tmdbSearching = false;
    }

    const onTmdbSearchInput = debounce(() => {
        if (!tmdbQuery.trim()) {
            tmdbSearchResults = [];
            return;
        }
        searchTMDB();
    }, 400);

    async function searchTMDB() {
        if (!tmdbQuery.trim()) return;
        tmdbSearchResultsLoading = true;
        try {
            const res = await api.tmdbSearch(tmdbQuery);
            tmdbSearchResults = res.results || [];
        } catch {
            tmdbSearchResults = [];
        }
        tmdbSearchResultsLoading = false;
    }

    function selectTmdbResult(item) {
        tmdbResult = {
            title: item.title || item.name,
            originalTitle: item.original_title || item.original_name,
            year: (item.release_date || item.first_air_date || "").substring(
                0,
                4,
            ),
            overview: item.overview,
            posterUrl: item.poster_path
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                : null,
            backdropUrl: item.backdrop_path
                ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}`
                : null,
            rating: item.vote_average,
            genres: [],
            mediaType: item.media_type,
        };
        tmdbQuery = "";
        tmdbSearchResults = [];
    }

    async function applyTMDB() {
        if (!tmdbResult) return;
        tmdbApplying = true;
        try {
            const update = {};
            if (tmdbResult.title) update.title = tmdbResult.title;
            if (tmdbResult.overview) update.description = tmdbResult.overview;
            if (tmdbResult.rating)
                update.rating = Math.round(tmdbResult.rating / 2); // TMDB 10分制 -> 5分制
            await api.updateResource(id, update);
            resource = await api.getResource(id);
            showToast({ type: "info", message: "TMDB元数据已应用" });
        } catch (err) {
            showToast({ type: "error", message: "应用失败: " + err.message });
        }
        tmdbApplying = false;
    }

    // 当前资源已关联的 tag ids
    $: resourceTagIds = new Set((resource?.tags || []).map((t) => t.id));
    $: availableTags = allTags.filter((t) => !resourceTagIds.has(t.id));
    $: totalMedia =
        (resource?.screenshots?.length || 0) + (resource?.videos?.length || 0);
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
                    {#if editing}
                        <select bind:value={editStatus} class="inline-select">
                            {#each Object.entries(STATUS_LABELS) as [val, label]}
                                <option value={val}>{label}</option>
                            {/each}
                        </select>
                        <span class="separator">·</span>
                        <select bind:value={editCategory} class="inline-select">
                            {#each CATEGORY_OPTIONS as cat}
                                <option value={cat}
                                    >{CATEGORY_LABELS[cat]}</option
                                >
                            {/each}
                        </select>
                    {:else}
                        <span>{resource.category || "未分类"}</span>
                        <span class="separator">·</span>
                        <span class={`status ${resource.status}`}
                            >{STATUS_LABELS[resource.status] ||
                                resource.status}</span
                        >
                    {/if}
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
                    <button on:click={startEditing} class="btn btn-secondary"
                        >编辑</button
                    >
                {/if}
                <button on:click={handleDelete} class="btn btn-danger"
                    ><Trash2 size={16} /></button
                >
            </div>
        </div>

        <!-- 磁链 -->
        <section class="section">
            <h3>磁链</h3>
            <code class="magnet-uri">{resource.magnet_uri}</code>
        </section>

        <!-- 描述 + 标签 + 评价 集中区域 -->
        <section class="section">
            <div class="info-grid">
                <!-- 描述 -->
                <div class="info-desc">
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
                </div>

                <!-- 标签 -->
                <div class="info-tags">
                    <h3>标签</h3>
                    <div class="tag-list">
                        {#each resource.tags || [] as tag}
                            <span
                                class="tag"
                                style="background: {tag.color}22; color: {tag.color}; border-color: {tag.color}44;"
                            >
                                {tag.name}
                                <button
                                    class="tag-remove"
                                    on:click={() => removeTag(tag.id)}
                                    title="移除标签"><X size={10} /></button
                                >
                            </span>
                        {/each}
                        {#if (resource.tags || []).length === 0}
                            <span class="no-tags">暂无标签</span>
                        {/if}
                    </div>

                    <!-- 添加已有标签 -->
                    {#if availableTags.length > 0}
                        <div class="add-tag-section">
                            <div class="available-tags">
                                {#each availableTags as tag}
                                    <button
                                        class="tag tag-addable"
                                        style="background: {tag.color}18; color: {tag.color}; border-color: {tag.color}33;"
                                        on:click={() => addTag(tag.id)}
                                        title="点击添加"
                                    >
                                        + {tag.name}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <!-- 新建标签 -->
                    {#if showTagInput}
                        <div class="new-tag-form">
                            <input
                                type="text"
                                bind:value={newTagName}
                                placeholder="标签名"
                                class="tag-name-input"
                            />
                            <input
                                type="color"
                                bind:value={newTagColor}
                                class="tag-color-input"
                            />
                            <button
                                class="btn btn-sm btn-primary"
                                on:click={createAndAddTag}>创建</button
                            >
                            <button
                                class="btn btn-sm btn-secondary"
                                on:click={() => {
                                    showTagInput = false;
                                    newTagName = "";
                                }}>取消</button
                            >
                        </div>
                    {:else}
                        <button
                            class="btn-new-tag"
                            on:click={() => (showTagInput = true)}
                        >
                            <Plus size={12} /> 新建标签
                        </button>
                    {/if}
                </div>

                <!-- 评价 -->
                <div class="info-rating">
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
                                    size={20}
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
                            rows="2"
                            class="review-textarea"
                        />
                    {:else if resource.review}
                        <p class="review">{resource.review}</p>
                    {/if}
                </div>
            </div>
        </section>

        <!-- 媒体（截图 + 视频 瀑布流） -->
        <section class="section">
            <h3>媒体 ({totalMedia})</h3>
            <p class="paste-hint">Ctrl+V 粘贴截图 / 视频</p>
            {#if videoUploading}
                <p class="paste-hint uploading">视频上传中...</p>
            {/if}
            {#if totalMedia > 0}
                <div class="media-waterfall">
                    {#each resource.screenshots || [] as shot}
                        <div class="media-item">
                            <img
                                src={api.getScreenshotUrl(
                                    id,
                                    shot.id,
                                    "original",
                                )}
                                alt=""
                                loading="lazy"
                            />
                            <button
                                class="shot-remove"
                                on:click|stopPropagation={() =>
                                    deleteScreenshot(shot.id)}
                                title="删除截图"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    {/each}
                    {#each resource.videos || [] as vid}
                        <div class="media-item media-video">
                            <video
                                src={api.getVideoUrl(id, vid.id)}
                                autoplay
                                loop
                                muted
                                playsinline
                            >
                                您的浏览器不支持视频播放
                            </video>
                            <div class="video-meta">
                                {vid.file_name} · {formatFileSize(
                                    vid.file_size,
                                )}
                            </div>
                            <button
                                class="shot-remove"
                                on:click|stopPropagation={() =>
                                    deleteVideo(vid.id)}
                                title="删除视频"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="media-empty">
                    <Image size={24} />
                    <span>暂无媒体，Ctrl+V 粘贴添加</span>
                </div>
            {/if}
        </section>

        <!-- 文件列表 -->
        {#if resource.files?.length > 0}
            <section class="section">
                <div class="section-header">
                    <h3>文件列表 ({resource.files.length})</h3>
                    <button
                        class="btn btn-sm btn-secondary"
                        on:click={refreshFileCache}
                        title="刷新文件缓存"
                    >
                        <RefreshCw size={14} /> 刷新
                    </button>
                </div>
                <div class="file-list">
                    {#each resource.files as file}
                        <div class="file-item">
                            <span class="file-path">{file.file_path}</span>
                            <span class="file-size"
                                >{formatFileSize(file.file_size)}</span
                            >
                        </div>
                    {/each}
                </div>
            </section>
        {/if}

        <!-- 下载状态 -->
        {#if resource.download}
            <section class="section">
                <h3>下载状态</h3>
                <div class="dl-info">
                    <span>状态: {resource.download.download_status}</span>
                    <span
                        >大小: {formatFileSize(
                            resource.download.total_size,
                        )}</span
                    >
                    <span
                        >路径: {resource.download.download_path || "默认"}</span
                    >
                </div>
            </section>
        {/if}

        <!-- TMDB 元数据（底部，可折叠） -->
        <section class="section tmdb-section">
            <div class="section-header">
                <h3><Film size={14} /> TMDB 元数据</h3>
            </div>

            {#if tmdbResult}
                <div class="tmdb-result">
                    {#if tmdbResult.posterUrl}
                        <img
                            src={tmdbResult.posterUrl}
                            alt={tmdbResult.title}
                            class="tmdb-poster"
                        />
                    {/if}
                    <div class="tmdb-info">
                        <h4>{tmdbResult.title}</h4>
                        {#if tmdbResult.originalTitle && tmdbResult.originalTitle !== tmdbResult.title}
                            <p class="tmdb-original">
                                {tmdbResult.originalTitle}
                            </p>
                        {/if}
                        <div class="tmdb-meta">
                            {#if tmdbResult.year}<span>{tmdbResult.year}</span
                                >{/if}
                            {#if tmdbResult.mediaType}<span class="tmdb-type"
                                    >{tmdbResult.mediaType === "movie"
                                        ? "电影"
                                        : "电视剧"}</span
                                >{/if}
                            {#if tmdbResult.rating}<span
                                    >⭐ {tmdbResult.rating}/10</span
                                >{/if}
                        </div>
                        {#if tmdbResult.overview}
                            <p class="tmdb-overview">
                                {tmdbResult.overview}
                            </p>
                        {/if}
                        {#if tmdbResult.genres && tmdbResult.genres.length > 0}
                            <div class="tmdb-genres">
                                {#each tmdbResult.genres as g}
                                    <span class="tmdb-genre">{g}</span>
                                {/each}
                            </div>
                        {/if}
                        <button
                            class="btn btn-primary btn-sm"
                            on:click={applyTMDB}
                            disabled={tmdbApplying}
                        >
                            {tmdbApplying ? "应用中..." : "应用元数据到资源"}
                        </button>
                    </div>
                </div>
            {:else if tmdbSearching}
                <p class="tmdb-hint">正在匹配...</p>
            {:else}
                <p class="tmdb-hint">搜索 TMDB 获取影视海报、简介和评分</p>
            {/if}

            <div class="tmdb-actions">
                <button
                    class="btn btn-secondary btn-sm"
                    on:click={matchTMDB}
                    disabled={tmdbSearching}
                >
                    <SearchIcon size={12} /> 自动匹配
                </button>
                <input
                    type="text"
                    bind:value={tmdbQuery}
                    on:input={onTmdbSearchInput}
                    placeholder="手动搜索标题..."
                    class="tmdb-search-input"
                />
            </div>

            {#if tmdbSearchResultsLoading}
                <span class="tmdb-hint">搜索中...</span>
            {:else if tmdbSearchResults.length > 0}
                <div class="tmdb-search-results">
                    {#each tmdbSearchResults.slice(0, 5) as item}
                        <button
                            class="tmdb-search-item"
                            on:click={() => selectTmdbResult(item)}
                        >
                            {#if item.poster_path}
                                <img
                                    src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                                    alt=""
                                    class="tmdb-thumb"
                                />
                            {:else}
                                <span class="tmdb-no-thumb"
                                    ><Image size={20} /></span
                                >
                            {/if}
                            <div class="tmdb-item-info">
                                <span class="tmdb-item-title"
                                    >{item.title || item.name}</span
                                >
                                <span class="tmdb-item-year"
                                    >{(
                                        item.release_date ||
                                        item.first_air_date ||
                                        ""
                                    ).substring(0, 4)}</span
                                >
                                <span class="tmdb-item-type"
                                    >{item.media_type === "movie"
                                        ? "🎬"
                                        : "📺"}</span
                                >
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </section>
    </div>
{/if}

<style>
    .detail-page {
        max-width: 1200px;
        margin: 0 auto;
    }

    /* ====== Header ====== */
    .detail-header {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 24px;
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
    .separator {
        color: #444;
    }
    .source {
        color: #555;
    }

    .header-actions {
        display: flex;
        gap: 8px;
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

    .inline-select {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        color: #e0e0e0;
        padding: 2px 8px;
        font-size: 13px;
        outline: none;
        cursor: pointer;
    }
    .inline-select:focus {
        border-color: #6366f1;
    }

    /* ====== Buttons ====== */
    .btn {
        display: inline-flex;
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
        color: #fff;
    }
    .btn-danger {
        background: #3a1a1a;
        color: #ef4444;
    }
    .btn-danger:hover {
        background: #4a1a1a;
    }
    .btn-sm {
        padding: 6px 14px;
        font-size: 12px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
    }

    /* ====== Sections ====== */
    .section {
        margin-bottom: 28px;
    }
    .section h3 {
        font-size: 13px;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        margin-bottom: 10px;
        letter-spacing: 0.5px;
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

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .section-header h3 {
        margin-bottom: 0;
    }

    /* ====== 磁链 ====== */
    .magnet-uri {
        display: block;
        font-size: 12px;
        color: #6366f1;
        word-break: break-all;
        background: #0a0a0a;
        padding: 12px;
        border-radius: 8px;
    }

    /* ====== 描述 + 标签 + 评价 网格 ====== */
    .info-grid {
        display: grid;
        grid-template-columns: 1fr 280px;
        grid-template-rows: auto auto;
        gap: 20px;
    }
    .info-desc {
        grid-row: 1 / 3;
    }
    .info-tags {
    }
    .info-rating {
    }

    /* ====== 评价 ====== */
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
    .review {
        margin-top: 8px;
        font-style: italic;
        color: #888;
        font-size: 13px;
    }
    .review-textarea {
        margin-top: 8px;
    }

    /* ====== 标签 ====== */
    .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .tag {
        padding: 4px 12px;
        border-radius: 6px;
        border: 1px solid;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        gap: 2px;
    }
    .tag-remove {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        opacity: 0.5;
        padding: 0 0 0 4px;
        display: inline-flex;
    }
    .tag-remove:hover {
        opacity: 1;
    }
    .no-tags {
        font-size: 12px;
        color: #555;
    }

    .add-tag-section {
        margin-top: 8px;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }
    .available-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    .tag-addable {
        cursor: pointer;
        transition: opacity 0.15s;
    }
    .tag-addable:hover {
        opacity: 0.7;
    }

    .new-tag-form {
        display: flex;
        gap: 6px;
        align-items: center;
        margin-top: 8px;
    }
    .tag-name-input {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 6px;
        color: #e0e0e0;
        padding: 5px 10px;
        font-size: 13px;
        width: 110px;
        outline: none;
    }
    .tag-name-input:focus {
        border-color: #6366f1;
    }
    .tag-color-input {
        width: 30px;
        height: 30px;
        border: 1px solid #333;
        border-radius: 6px;
        cursor: pointer;
        background: none;
        padding: 2px;
    }
    .btn-new-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: none;
        border: 1px dashed #333;
        color: #666;
        padding: 5px 12px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        margin-top: 8px;
    }
    .btn-new-tag:hover {
        border-color: #6366f1;
        color: #6366f1;
    }

    /* ====== 粘贴提示（小字） ====== */
    .paste-hint {
        font-size: 12px;
        color: #555;
        margin-bottom: 12px;
    }
    .paste-hint.uploading {
        color: #6366f1;
    }

    /* ====== 媒体瀑布流 ====== */
    .media-waterfall {
        columns: 3;
        column-gap: 12px;
    }
    .media-item {
        break-inside: avoid;
        position: relative;
        border-radius: 8px;
        overflow: hidden;
        background: #1a1a1a;
        margin-bottom: 12px;
    }
    .media-item img {
        width: 100%;
        height: auto;
        display: block;
    }
    .media-item video {
        width: 100%;
        height: auto;
        display: block;
        background: #000;
    }
    .media-video .video-meta {
        padding: 6px 10px;
        font-size: 11px;
        color: #888;
    }

    .shot-remove {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.7);
        border: none;
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.15s;
        z-index: 2;
    }
    .media-item:hover .shot-remove {
        opacity: 1;
    }
    .shot-remove:hover {
        background: rgba(220, 38, 38, 0.85);
    }

    .media-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 40px;
        color: #555;
        font-size: 13px;
        border: 1px dashed #2a2a2a;
        border-radius: 10px;
    }

    /* ====== 文件列表 ====== */
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

    /* ====== 下载状态 ====== */
    .dl-info {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 13px;
        color: #aaa;
    }

    /* ====== TMDB 底部区域 ====== */
    .tmdb-section {
        border-top: 1px solid #222;
        padding-top: 24px;
        margin-top: 8px;
    }
    .tmdb-result {
        display: flex;
        gap: 14px;
        margin-bottom: 12px;
    }
    .tmdb-poster {
        width: 80px;
        height: 120px;
        border-radius: 6px;
        object-fit: cover;
        flex-shrink: 0;
        background: #1a1a1a;
    }
    .tmdb-info {
        flex: 1;
        min-width: 0;
    }
    .tmdb-info h4 {
        font-size: 15px;
        color: #e0e0e0;
        margin-bottom: 2px;
    }
    .tmdb-original {
        font-size: 11px;
        color: #555;
        margin-bottom: 4px;
    }
    .tmdb-meta {
        display: flex;
        gap: 8px;
        font-size: 11px;
        color: #666;
        margin-bottom: 6px;
        flex-wrap: wrap;
    }
    .tmdb-type {
        background: #2a2a2a;
        padding: 0 6px;
        border-radius: 3px;
        font-size: 10px;
    }
    .tmdb-overview {
        font-size: 12px;
        color: #888;
        line-height: 1.5;
        margin-bottom: 8px;
    }
    .tmdb-genres {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-bottom: 8px;
    }
    .tmdb-genre {
        font-size: 10px;
        color: #6366f1;
        background: #6366f122;
        padding: 1px 8px;
        border-radius: 10px;
    }
    .tmdb-hint {
        font-size: 12px;
        color: #555;
        padding: 4px 0;
    }

    .tmdb-actions {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 10px;
    }
    .tmdb-search-input {
        flex: 1;
        max-width: 260px;
        background: #1a1a1a;
        border: 1px solid #333;
        color: #e0e0e0;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 12px;
        outline: none;
    }
    .tmdb-search-input:focus {
        border-color: #6366f1;
    }

    .tmdb-search-results {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    .tmdb-search-item {
        display: flex;
        gap: 8px;
        align-items: center;
        background: #1a1a1a;
        border: none;
        color: #aaa;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        text-align: left;
    }
    .tmdb-search-item:hover {
        background: #2a2a2a;
        color: #fff;
    }
    .tmdb-thumb {
        width: 32px;
        height: 48px;
        border-radius: 3px;
        object-fit: cover;
    }
    .tmdb-no-thumb {
        width: 32px;
        height: 48px;
        border-radius: 3px;
        background: #222;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #444;
    }
    .tmdb-item-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }
    .tmdb-item-title {
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .tmdb-item-year {
        font-size: 10px;
        color: #666;
    }
    .tmdb-item-type {
        font-size: 10px;
    }
</style>
