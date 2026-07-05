<script>
    import { onMount } from "svelte";
    import { resources, stagingResources } from "../lib/stores/resources.js";
    import { viewMode } from "../lib/stores/ui.js";
    import ResourceCard from "../components/ResourceCard.svelte";
    import SearchBar from "../components/SearchBar.svelte";
    import { api } from "../lib/api.js";
    import { showToast } from "../lib/stores/ui.js";
    import {
        LayoutGrid, List, Plus, X,
        ChevronLeft, ChevronRight,
        Filter, ArrowUpDown,
    } from "lucide-svelte";

    let loading = true;
    let showAddDialog = false;
    let showFilters = false;
    let pasteText = "";
    let adding = false;

    // 筛选状态
    let filterStatus = "";
    let filterCategory = "";
    let filterGroup = "";
    let filterTag = "";
    let sortField = "created_at";
    let sortOrder = "desc";

    // 分组和标签数据（用于筛选下拉）
    let groups = [];
    let tags = [];

    const PAGE_SIZE = 30;
    let currentPage = 1;

    onMount(() => {
        loadResources();
        loadFilterOptions();
    });

    async function loadFilterOptions() {
        try {
            [groups, tags] = await Promise.all([api.getGroups(), api.getTags()]);
        } catch { /* 非关键 */ }
    }

    function buildParams(page = 1) {
        const p = { is_deleted: 0, limit: PAGE_SIZE, page, sort: sortField, order: sortOrder };
        if (filterStatus) p.status = filterStatus;
        if (filterCategory) p.category = filterCategory;
        if (filterGroup) p.group = filterGroup;
        if (filterTag) p.tag = filterTag;
        return p;
    }

    async function loadResources(page = 1) {
        loading = true;
        currentPage = page;
        try {
            await resources.fetch(buildParams(page));
        } finally {
            loading = false;
        }
    }

    $: totalPages = Math.max(1, Math.ceil($resources.total / PAGE_SIZE));

    function handleSearch(e) {
        const q = e.detail || e.target?.value;
        if (q) {
            resources.fetch({ search: q, is_deleted: 0, limit: PAGE_SIZE });
        } else {
            loadResources(1);
        }
    }

    function applyFilters() {
        loadResources(1);
    }

    function clearFilters() {
        filterStatus = "";
        filterCategory = "";
        filterGroup = "";
        filterTag = "";
        sortField = "created_at";
        sortOrder = "desc";
        loadResources(1);
    }

    function extractMagnetLinks(text) {
        const results = [];
        const seenHash = new Set();

        // 1) 标准 magnet:? 链接
        const magnetRe = /magnet:\?xt=urn:btih:(?:[a-fA-F0-9]{40}|[A-Z2-7a-z2-7]{32})(?:&[a-zA-Z]+=[^&\r\n]+)*/gi;
        for (const m of text.matchAll(magnetRe)) {
            results.push({ uri: m[0], type: "magnet" });
            // 记录 BTIH 防重复（支持十六进制和 Base32）
            const h = m[0].match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
            if (h) seenHash.add(h[1].toLowerCase());
        }

        // 2) 截断磁链（hash&dn=xxx&xl=xxx），补全为完整 magnet URI
        const truncatedRe = /\b([A-Z2-7a-z2-7]{32}|[a-fA-F0-9]{40})(?:&[a-z]+=[^&\s<>"]+)+\b/gi;
        for (const m of text.matchAll(truncatedRe)) {
            const uri = "magnet:?xt=urn:btih:" + m[0];
            results.push({ uri, type: "magnet" });
            const h = uri.match(/btih:([a-fA-F0-9]{40}|[A-Z2-7]{32})/i);
            if (h) seenHash.add(h[1].toLowerCase());
        }

        // 3) 纯 Base32 BTIH hash（32位），自动构造 magnet URI
        const base32Re = /\b([A-Z2-7a-z2-7]{32})\b/g;
        for (const m of text.matchAll(base32Re)) {
            const lower = m[1].toLowerCase();
            if (!seenHash.has(lower)) {
                seenHash.add(lower);
                results.push({ uri: `magnet:?xt=urn:btih:${lower}`, type: "magnet" });
            }
        }

        // 4) 纯十六进制 BTIH hash（40位），自动构造 magnet URI
        const hashRe = /\b([a-fA-F0-9]{40})\b/g;
        for (const m of text.matchAll(hashRe)) {
            const lower = m[1].toLowerCase();
            if (!seenHash.has(lower)) {
                seenHash.add(lower);
                results.push({ uri: `magnet:?xt=urn:btih:${lower}`, type: "magnet" });
            }
        }
        // 5) 干扰字符滤除：先清理已被步骤1-4匹配的已知文本，再对剩余文本提取散落hash
        let cleanedText = text;
        for (const r of results) {
            cleanedText = cleanedText.split(r.uri).join('');
        }
        cleanedText = cleanedText.replace(magnetRe, '');

        const hexOnly = cleanedText.replace(/[^a-fA-F0-9]/g, '');
        for (let i = 0; i <= hexOnly.length - 40; i++) {
            const candidate = hexOnly.substring(i, i + 40);
            if (/^[a-fA-F0-9]{40}$/.test(candidate)) {
                const lower = candidate.toLowerCase();
                if (!seenHash.has(lower)) {
                    seenHash.add(lower);
                    results.push({ uri: `magnet:?xt=urn:btih:${lower}`, type: "magnet" });
                }
                i += 39;
            }
        }

        const base32Only = cleanedText.replace(/[^A-Z2-7a-z2-7]/gi, '');
        for (let i = 0; i <= base32Only.length - 32; i++) {
            const candidate = base32Only.substring(i, i + 32);
            if (/^[A-Z2-7a-z2-7]{32}$/i.test(candidate)) {
                const lower = candidate.toLowerCase();
                if (!seenHash.has(lower)) {
                    seenHash.add(lower);
                    results.push({ uri: `magnet:?xt=urn:btih:${lower}`, type: "magnet" });
                }
                i += 31;
            }
        }
        return results;
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

        // 推入暂存区
        stagingResources.update(items => [
            ...items,
            ...links.map(l => ({
                magnet_uri: l.uri,
                source_app: "手动录入",
                title: "",
                status: "draft",
                context_text: pasteText,
                _ts: Date.now(),
            })),
        ]);

        showToast({ type: "info", message: `已添加 ${links.length} 个资源到暂存区` });
        pasteText = "";
        showAddDialog = false;
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
            <button class="btn-filter" class:active={showFilters} on:click={() => (showFilters = !showFilters)}>
                <Filter size={14} /> 筛选
            </button>
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

    <!-- 筛选栏 -->
    <div class="filter-bar" class:visible={showFilters}>
        <div class="filter-row">
            <div class="filter-group">
                <label>状态</label>
                <select bind:value={filterStatus} on:change={applyFilters}>
                    <option value="">全部</option>
                    <option value="draft">待完善</option>
                    <option value="active">已入库</option>
                    <option value="downloaded">已下载</option>
                </select>
            </div>
            <div class="filter-group">
                <label>分类</label>
                <select bind:value={filterCategory} on:change={applyFilters}>
                    <option value="">全部</option>
                    <option value="movie">电影</option>
                    <option value="tv">电视剧</option>
                    <option value="anime">动画</option>
                    <option value="music">音乐</option>
                    <option value="game">游戏</option>
                    <option value="software">软件</option>
                    <option value="book">书籍</option>
                    <option value="other">其他</option>
                </select>
            </div>
            <div class="filter-group">
                <label>分组</label>
                <select bind:value={filterGroup} on:change={applyFilters}>
                    <option value="">全部</option>
                    {#each groups as g}
                        <option value={g.id}>{g.name} ({g.resource_count})</option>
                    {/each}
                </select>
            </div>
            <div class="filter-group">
                <label>标签</label>
                <select bind:value={filterTag} on:change={applyFilters}>
                    <option value="">全部</option>
                    {#each tags as t}
                        <option value={t.id}>{t.name} ({t.resource_count})</option>
                    {/each}
                </select>
            </div>
            <div class="filter-group">
                <label>排序</label>
                <select bind:value={sortField} on:change={applyFilters}>
                    <option value="created_at">创建时间</option>
                    <option value="updated_at">更新时间</option>
                    <option value="title">标题</option>
                    <option value="rating">评分</option>
                </select>
            </div>
            <button class="btn-icon" on:click={() => { sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'; applyFilters(); }} title={sortOrder === 'asc' ? '升序' : '降序'}>
                <ArrowUpDown size={16} />
            </button>
            <button class="btn-text" on:click={clearFilters}>清除筛选</button>
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

        <!-- 分页 -->
        {#if totalPages > 1}
            <div class="pagination">
                <button disabled={currentPage <= 1} on:click={() => loadResources(currentPage - 1)}>
                    <ChevronLeft size={16} />
                </button>
                <span class="page-info">{currentPage} / {totalPages} (共 {$resources.total} 条)</span>
                <button disabled={currentPage >= totalPages} on:click={() => loadResources(currentPage + 1)}>
                    <ChevronRight size={16} />
                </button>
            </div>
        {/if}
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
                    粘贴磁链（magnet:?）后进入暂存区，可在底部暂存区确认入库
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
                <button class="btn-submit" on:click={handleAddResources} disabled={!pasteText.trim()}>添加到暂存区</button>
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

    .btn-filter {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #2a2a2a;
        border: none;
        color: #aaa;
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 13px;
        cursor: pointer;
    }

    .btn-filter:hover, .btn-filter.active {
        background: #3a3a3a;
        color: #fff;
    }

    .filter-bar {
        display: none;
        background: #141414;
        border: 1px solid #222;
        border-radius: 10px;
        padding: 14px 16px;
        margin-bottom: 16px;
    }

    .filter-bar.visible {
        display: block;
    }

    .filter-row {
        display: flex;
        align-items: flex-end;
        gap: 14px;
        flex-wrap: wrap;
    }

    .filter-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .filter-group label {
        font-size: 11px;
        color: #666;
        text-transform: uppercase;
    }

    .filter-group select {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 6px;
        color: #e0e0e0;
        padding: 6px 10px;
        font-size: 13px;
        outline: none;
        cursor: pointer;
    }

    .filter-group select:focus {
        border-color: #6366f1;
    }

    .btn-icon {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 6px;
        color: #aaa;
        padding: 7px 10px;
        cursor: pointer;
        display: flex;
    }

    .btn-icon:hover { background: #2a2a2a; color: #fff; }

    .btn-text {
        background: none;
        border: none;
        color: #666;
        font-size: 12px;
        cursor: pointer;
        padding: 6px;
    }

    .btn-text:hover { color: #ef4444; }

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
