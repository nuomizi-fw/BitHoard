<script context="module">
    function formatFileSize(bytes) {
        if (!bytes) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let i = 0,
            size = bytes;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return `${size.toFixed(1)} ${units[i]}`;
    }
</script>

<script>
    import { onMount } from "svelte";
    import { api } from "../lib/api.js";
    import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-svelte";
    import SearchBar from "../components/SearchBar.svelte";

    let query = "";
    let results = null;
    let loading = false;
    let showAdvanced = false;

    // 分页
    const PAGE_SIZE = 20;
    let currentPage = 1;
    let totalPages = 1;
    let lastSearchMode = ""; // "simple" or "advanced"

    // 高级筛选
    let filters = {
        category: "",
        rating_min: 0,
        rating_max: 5,
        status: "",
        source_app: "",
        has_download: null,
    };

    const categories = ["影视", "软件", "书籍", "音乐", "其他"];
    const sources = [
        "微信",
        "QQ",
        "Chrome",
        "Edge",
        "Firefox",
        "浏览器",
        "未知",
    ];

    async function doSearch(page = 1) {
        if (!query.trim()) return;
        loading = true;
        currentPage = page;
        lastSearchMode = "simple";
        try {
            const res = await api.search(query);
            results = res;
            if (res.resources) {
                totalPages = Math.max(1, Math.ceil((res.resources.total || 0) / PAGE_SIZE));
            }
        } catch (e) {
            console.error(e);
        }
        loading = false;
    }

    async function doAdvancedSearch(page = 1) {
        loading = true;
        currentPage = page;
        lastSearchMode = "advanced";
        try {
            const active = Object.fromEntries(
                Object.entries(filters).filter(
                    ([, v]) => v !== "" && v !== null && v !== 0,
                ),
            );
            const res = await api.advancedSearch({ q: query, ...active, page, limit: PAGE_SIZE });
            results = {
                resources: { items: res.items, total: res.total },
                files: null,
            };
            totalPages = Math.max(1, Math.ceil((res.total || 0) / PAGE_SIZE));
        } catch (e) {
            console.error(e);
        }
        loading = false;
    }

    function goPage(page) {
        if (lastSearchMode === "advanced") doAdvancedSearch(page);
        else doSearch(page);
    }

    function clearFilters() {
        filters = {
            category: "",
            rating_min: 0,
            rating_max: 5,
            status: "",
            source_app: "",
            has_download: null,
        };
    }

    function handleKeydown(e) {
        if (e.key === "Enter") doSearch();
    }

    onMount(() => {
        // 从 URL 读取预置搜索词
        const params = new URLSearchParams(window.location.search);
        const q = params.get("q");
        if (q) {
            query = q;
            doSearch();
        }
    });
</script>

<div class="search-page">
    <div class="search-header">
        <h2>搜索</h2>
        <div class="search-input-wrap">
            <Search size={18} class="search-icon" />
            <input
                type="text"
                bind:value={query}
                placeholder="搜索资源名称、描述、文件名..."
                on:keydown={handleKeydown}
            />
            <button class="btn-search" on:click={doSearch} disabled={loading}>
                {loading ? "搜索中..." : "搜索"}
            </button>
            <button
                class="btn-advanced"
                class:active={showAdvanced}
                on:click={() => (showAdvanced = !showAdvanced)}
            >
                <SlidersHorizontal size={16} />
                高级
            </button>
        </div>
    </div>

    {#if showAdvanced}
        <div class="advanced-panel">
            <div class="filter-row">
                <label>
                    分类
                    <select bind:value={filters.category}>
                        <option value="">全部</option>
                        {#each categories as cat}
                            <option value={cat}>{cat}</option>
                        {/each}
                    </select>
                </label>
                <label>
                    最低评分
                    <select bind:value={filters.rating_min}>
                        <option value={0}>不限</option>
                        {#each [1, 2, 3, 4, 5] as r}
                            <option value={r}>≥ {r} 星</option>
                        {/each}
                    </select>
                </label>
                <label>
                    状态
                    <select bind:value={filters.status}>
                        <option value="">全部</option>
                        <option value="draft">草稿</option>
                        <option value="active">已确认</option>
                    </select>
                </label>
                <label>
                    来源
                    <select bind:value={filters.source_app}>
                        <option value="">全部</option>
                        {#each sources as src}
                            <option value={src}>{src}</option>
                        {/each}
                    </select>
                </label>
                <label>
                    下载状态
                    <select bind:value={filters.has_download}>
                        <option value={null}>全部</option>
                        <option value={true}>已下载</option>
                        <option value={false}>未下载</option>
                    </select>
                </label>
            </div>
            <div class="filter-actions">
                <button class="btn-apply" on:click={doAdvancedSearch}
                    >应用筛选</button
                >
                <button class="btn-clear" on:click={clearFilters}>
                    <X size={14} /> 清除
                </button>
            </div>
        </div>
    {/if}

    <div class="search-results">
        {#if loading}
            <div class="loading">搜索中...</div>
        {:else if results}
            {#if results.resources}
                <section>
                    <h3>
                        资源 ({results.resources.total ||
                            results.resources.items.length})
                    </h3>
                    {#if results.resources.items.length === 0}
                        <p class="empty">暂无匹配资源</p>
                    {:else}
                        <div class="result-list">
                            {#each results.resources.items as r}
                                <a
                                    href={`/resource/${r.id}`}
                                    class="result-item"
                                >
                                    <div class="result-main">
                                        <h4>{r.title || "未命名资源"}</h4>
                                        <div class="result-meta">
                                            <span class="category-tag"
                                                >{r.category || "其他"}</span
                                            >
                                            <span>{r.source_app || "未知"}</span
                                            >
                                            {#if r.rating > 0}
                                                <span class="rating"
                                                    >{"⭐".repeat(
                                                        r.rating,
                                                    )}</span
                                                >
                                            {/if}
                                            <span class="date"
                                                >{r.created_at?.slice(
                                                    0,
                                                    10,
                                                )}</span
                                            >
                                        </div>
                                    </div>
                                    {#if r.screenshot_count > 0}
                                        <span class="screenshot-badge"
                                            >📷 {r.screenshot_count}</span
                                        >
                                    {/if}
                                </a>
                            {/each}
                        </div>
                    {/if}
                </section>
            {/if}

            {#if results.files && results.files.items.length > 0}
                <section>
                    <h3>匹配文件 ({results.files.total})</h3>
                    <div class="result-list">
                        {#each results.files.items as f}
                            <a
                                href={`/resource/${f.resource_id}`}
                                class="result-item"
                            >
                                <div class="result-main">
                                    <h4>{f.file_path}</h4>
                                    <div class="result-meta">
                                        <span>{f.resource_title}</span>
                                        <span
                                            >{formatFileSize(f.file_size)}</span
                                        >
                                    </div>
                                </div>
                            </a>
                        {/each}
                    </div>
                </section>
            {/if}

            <!-- 分页 -->
            {#if totalPages > 1 && results.resources}
                <div class="pagination">
                    <button disabled={currentPage <= 1} on:click={() => goPage(currentPage - 1)}>
                        <ChevronLeft size={16} />
                    </button>
                    <span class="page-info">{currentPage} / {totalPages} (共 {results.resources.total || 0} 条)</span>
                    <button disabled={currentPage >= totalPages} on:click={() => goPage(currentPage + 1)}>
                        <ChevronRight size={16} />
                    </button>
                </div>
            {/if}
        {:else}
            <div class="empty-hint">
                <Search size={48} />
                <p>输入关键词搜索资源或文件名</p>
            </div>
        {/if}
    </div>
</div>

<style>
    .search-page {
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 24px;
        overflow-y: auto;
    }

    .search-header h2 {
        font-size: 20px;
        margin-bottom: 16px;
    }

    .search-input-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 8px 12px;
    }

    .search-input-wrap:focus-within {
        border-color: #6366f1;
    }

    :global(.search-icon) {
        color: #666;
        flex-shrink: 0;
    }

    .search-input-wrap input {
        flex: 1;
        background: none;
        border: none;
        color: #e0e0e0;
        font-size: 15px;
        outline: none;
        min-width: 0;
    }

    .btn-search {
        padding: 6px 16px;
        background: #6366f1;
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;
    }

    .btn-search:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-advanced {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        background: none;
        border: 1px solid #444;
        color: #999;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;
    }

    .btn-advanced.active {
        background: #2a2a3a;
        border-color: #6366f1;
        color: #a5b4fc;
    }

    .advanced-panel {
        margin-top: 12px;
        padding: 16px;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
    }

    .filter-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
    }

    .filter-row label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        color: #999;
    }

    .filter-row select {
        background: #0f0f0f;
        border: 1px solid #333;
        color: #e0e0e0;
        padding: 6px 8px;
        border-radius: 4px;
        font-size: 13px;
        min-width: 100px;
    }

    .filter-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
    }

    .btn-apply {
        padding: 6px 16px;
        background: #6366f1;
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
    }

    .btn-clear {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        background: none;
        border: 1px solid #444;
        color: #999;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
    }

    .search-results {
        margin-top: 20px;
        flex: 1;
    }

    .search-results section {
        margin-bottom: 24px;
    }

    .search-results h3 {
        font-size: 14px;
        color: #999;
        margin-bottom: 10px;
    }

    .result-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .result-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        text-decoration: none;
        color: inherit;
        transition: border-color 0.2s;
    }

    .result-item:hover {
        border-color: #6366f1;
    }

    .result-main h4 {
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 4px;
    }

    .result-meta {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: #888;
        align-items: center;
    }

    .category-tag {
        padding: 1px 6px;
        background: #2a2a3a;
        border-radius: 3px;
        font-size: 11px;
    }

    .rating {
        color: #f59e0b;
    }

    .screenshot-badge {
        font-size: 12px;
        color: #666;
    }

    .loading,
    .empty,
    .empty-hint {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 48px 0;
        color: #666;
    }

    .empty-hint p {
        font-size: 14px;
    }

    .pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 20px 0;
    }

    .pagination button {
        background: #2a2a2a;
        border: none;
        color: #aaa;
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        display: flex;
    }

    .pagination button:hover:not(:disabled) { background: #3a3a3a; color: #fff; }
    .pagination button:disabled { opacity: 0.3; cursor: default; }

    .page-info { font-size: 13px; color: #888; }
</style>
