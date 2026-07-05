<script>
    import { onMount } from "svelte";
    import { link } from "svelte-routing";
    import { api } from "../lib/api.js";
    import { showToast } from "../lib/stores/ui.js";
    import { debounce } from "../lib/utils.js";
    import Modal from "../components/Modal.svelte";
    import {
        FolderOpen,
        Plus,
        X,
        Edit3,
        Trash2,
        ChevronRight,
        Search,
        Package,
    } from "lucide-svelte";

    let groups = [];
    let loading = true;
    let showDialog = false;
    let editingGroup = null;

    // 表单
    let formName = "";
    let formDescription = "";
    let saving = false;

    // 展开详情
    let expandedId = null;
    let groupDetail = null;
    let detailLoading = false;

    // 添加资源
    let showAddResource = false;
    let resourceSearch = "";
    let searchResults = [];
    let searching = false;

    onMount(loadGroups);

    async function loadGroups() {
        loading = true;
        try {
            groups = await api.getGroups();
        } catch (err) {
            showToast({ type: "error", message: "加载分组失败" });
        }
        loading = false;
    }

    function openCreate() {
        editingGroup = null;
        formName = "";
        formDescription = "";
        showDialog = true;
    }

    function openEdit(group) {
        editingGroup = group;
        formName = group.name;
        formDescription = group.description || "";
        showDialog = true;
    }

    async function saveGroup() {
        if (!formName.trim()) return;
        saving = true;
        try {
            if (editingGroup) {
                await api.updateGroup(editingGroup.id, {
                    name: formName.trim(),
                    description: formDescription.trim(),
                });
                showToast({ type: "info", message: "分组已更新" });
            } else {
                await api.createGroup(formName.trim(), formDescription.trim());
                showToast({ type: "info", message: "分组已创建" });
            }
            showDialog = false;
            await loadGroups();
        } catch (err) {
            showToast({ type: "error", message: "保存失败: " + err.message });
        }
        saving = false;
    }

    async function deleteGroup(group) {
        if (!confirm(`确定删除分组"${group.name}"吗？`)) return;
        try {
            await api.deleteGroup(group.id);
            showToast({ type: "info", message: "分组已删除" });
            if (expandedId === group.id) expandedId = null;
            await loadGroups();
        } catch (err) {
            showToast({ type: "error", message: "删除失败" });
        }
    }

    async function toggleDetail(group) {
        if (expandedId === group.id) {
            expandedId = null;
            groupDetail = null;
            return;
        }
        expandedId = group.id;
        detailLoading = true;
        try {
            groupDetail = await api.getGroup(group.id);
        } catch (err) {
            showToast({ type: "error", message: "加载详情失败" });
        }
        detailLoading = false;
    }

    async function searchResources() {
        if (!resourceSearch.trim()) {
            searchResults = [];
            return;
        }
        searching = true;
        try {
            searchResults = (
                await api.getResources({
                    search: resourceSearch,
                    is_deleted: 0,
                    limit: 10,
                })
            ).items;
        } catch {
            searchResults = [];
        }
        searching = false;
    }

    async function addResourceToGroup(resourceId) {
        try {
            await api.addToGroup(expandedId, resourceId);
            groupDetail = await api.getGroup(expandedId);
            await loadGroups();
            showToast({ type: "info", message: "已添加资源到分组" });
        } catch (err) {
            showToast({ type: "error", message: "添加失败" });
        }
    }

    async function removeResourceFromGroup(resourceId) {
        try {
            await api.removeFromGroup(expandedId, resourceId);
            groupDetail = await api.getGroup(expandedId);
            await loadGroups();
            showToast({ type: "info", message: "已从分组移除资源" });
        } catch (err) {
            showToast({ type: "error", message: "移除失败" });
        }
    }

    const onSearchInput = debounce(searchResources, 300);
</script>

<div class="groups-page">
    <div class="page-header">
        <div class="header-left">
            <h2>分组管理</h2>
            <span class="count">{groups.length} 个分组</span>
        </div>
        <button class="btn-add" on:click={openCreate}>
            <Plus size={16} /> 新建分组
        </button>
    </div>

    {#if loading}
        <div class="loading">加载中...</div>
    {:else if groups.length === 0}
        <div class="empty">
            <FolderOpen size={48} />
            <p>暂无分组</p>
            <p class="hint">
                创建分组来整理你的资源，比如"电影合集"、"学习资料"
            </p>
        </div>
    {:else}
        <div class="group-list">
            {#each groups as group (group.id)}
                <div
                    class="group-card"
                    class:expanded={expandedId === group.id}
                >
                    <div class="group-row" on:click={() => toggleDetail(group)}>
                        <div class="group-info">
                            <h3>
                                <FolderOpen size={18} />
                                {group.name}
                            </h3>
                            <div class="group-meta">
                                <span class="resource-count"
                                    >{group.resource_count || 0} 个资源</span
                                >
                                {#if group.description}
                                    <span class="group-desc"
                                        >{group.description}</span
                                    >
                                {/if}
                            </div>
                        </div>
                        <div class="group-actions" on:click|stopPropagation>
                            <button
                                class="btn-icon-sm"
                                on:click={() => openEdit(group)}
                                title="编辑"><Edit3 size={14} /></button
                            >
                            <button
                                class="btn-icon-sm danger"
                                on:click={() => deleteGroup(group)}
                                title="删除"><Trash2 size={14} /></button
                            >
                            <span
                                class="expand-icon"
                                class:rotated={expandedId === group.id}
                                ><ChevronRight size={16} /></span
                            >
                        </div>
                    </div>

                    {#if expandedId === group.id}
                        <div class="group-detail">
                            {#if detailLoading}
                                <div class="loading-sm">加载中...</div>
                            {:else if groupDetail}
                                <!-- 添加资源 -->
                                <div class="add-resource-section">
                                    <button
                                        class="btn-text"
                                        on:click={() =>
                                            (showAddResource =
                                                !showAddResource)}
                                    >
                                        <Plus size={14} /> 添加资源到分组
                                    </button>
                                    {#if showAddResource}
                                        <div class="search-box">
                                            <input
                                                type="text"
                                                bind:value={resourceSearch}
                                                on:input={onSearchInput}
                                                placeholder="搜索资源..."
                                            />
                                            {#if searching}
                                                <span class="searching"
                                                    >搜索中...</span
                                                >
                                            {:else if searchResults.length > 0}
                                                <div class="search-results">
                                                    {#each searchResults as r}
                                                        <button
                                                            class="result-item"
                                                            on:click={() =>
                                                                addResourceToGroup(
                                                                    r.id,
                                                                )}
                                                        >
                                                            <span
                                                                >{r.title ||
                                                                    "未命名资源"}</span
                                                            >
                                                            <Plus size={12} />
                                                        </button>
                                                    {/each}
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>

                                <!-- 资源列表 -->
                                {#if groupDetail.resources && groupDetail.resources.length > 0}
                                    <div class="detail-resources">
                                        {#each groupDetail.resources as r}
                                            <div class="detail-resource-item">
                                                <a
                                                    href={`/resource/${r.id}`}
                                                    use:link
                                                    class="resource-link"
                                                >
                                                    {r.title || "未命名资源"}
                                                </a>
                                                <span class="resource-status"
                                                    >{r.status}</span
                                                >
                                                <button
                                                    class="btn-icon-xs danger"
                                                    on:click={() =>
                                                        removeResourceFromGroup(
                                                            r.id,
                                                        )}
                                                    title="移出分组"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        {/each}
                                    </div>
                                {:else}
                                    <p class="no-resources">此分组还没有资源</p>
                                {/if}
                            {/if}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- 新建/编辑对话框 -->
<Modal
    show={showDialog}
    title={editingGroup ? "编辑分组" : "新建分组"}
    on:close={() => (showDialog = false)}
>
    <div class="dialog-body">
        <label>
            名称
            <input type="text" bind:value={formName} placeholder="分组名称" />
        </label>
        <label>
            描述
            <textarea
                bind:value={formDescription}
                placeholder="分组描述（可选）"
                rows="3"
            ></textarea>
        </label>
    </div>
    <div slot="footer">
        <button class="btn-cancel" on:click={() => (showDialog = false)}
            >取消</button
        >
        <button
            class="btn-submit"
            on:click={saveGroup}
            disabled={saving || !formName.trim()}
        >
            {saving ? "保存中..." : "保存"}
        </button>
    </div>
</Modal>

<style>
    .groups-page {
        max-width: 900px;
        margin: 0 auto;
    }

    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 12px;
    }
    .header-left {
        display: flex;
        align-items: baseline;
        gap: 12px;
    }
    .header-left h2 {
        font-size: 22px;
        color: #e0e0e0;
    }
    .count {
        font-size: 13px;
        color: #666;
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
    }
    .btn-add:hover {
        background: #5558e6;
    }

    .loading,
    .empty {
        text-align: center;
        padding: 60px 20px;
        color: #666;
    }
    .empty p {
        margin-top: 12px;
    }
    .empty .hint {
        font-size: 13px;
        color: #444;
    }

    .group-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .group-card {
        background: #141414;
        border: 1px solid #222;
        border-radius: 10px;
        overflow: hidden;
        transition: border-color 0.15s;
    }
    .group-card:hover {
        border-color: #333;
    }

    .group-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        cursor: pointer;
        gap: 12px;
    }
    .group-info h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 15px;
        color: #e0e0e0;
    }
    .group-meta {
        display: flex;
        gap: 12px;
        margin-top: 4px;
        font-size: 12px;
    }
    .resource-count {
        color: #6366f1;
    }
    .group-desc {
        color: #666;
    }

    .group-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
    }
    .btn-icon-sm {
        background: none;
        border: none;
        color: #555;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
    }
    .btn-icon-sm:hover {
        background: #2a2a2a;
        color: #aaa;
    }
    .btn-icon-sm.danger:hover {
        color: #ef4444;
        background: #3a1a1a;
    }
    .expand-icon {
        color: #555;
        transition: transform 0.2s;
    }
    .expand-icon.rotated {
        transform: rotate(90deg);
    }

    .group-detail {
        border-top: 1px solid #222;
        padding: 16px 18px;
    }
    .loading-sm {
        color: #666;
        text-align: center;
        padding: 12px;
        font-size: 13px;
    }

    .add-resource-section {
        margin-bottom: 14px;
    }
    .btn-text {
        display: flex;
        align-items: center;
        gap: 4px;
        background: none;
        border: 1px dashed #333;
        color: #666;
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
    }
    .btn-text:hover {
        border-color: #6366f1;
        color: #6366f1;
    }

    .search-box {
        margin-top: 8px;
    }
    .search-box input {
        width: 100%;
        background: #1a1a1a;
        border: 1px solid #333;
        color: #e0e0e0;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        outline: none;
    }
    .search-box input:focus {
        border-color: #6366f1;
    }
    .searching {
        font-size: 12px;
        color: #666;
        display: block;
        margin-top: 4px;
    }
    .search-results {
        margin-top: 6px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 200px;
        overflow-y: auto;
    }
    .result-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #1a1a1a;
        border: none;
        color: #aaa;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        width: 100%;
        text-align: left;
    }
    .result-item:hover {
        background: #2a2a2a;
        color: #fff;
    }

    .detail-resources {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .detail-resource-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #1a1a1a;
        border-radius: 6px;
    }
    .resource-link {
        flex: 1;
        font-size: 13px;
        color: #a0a0ff;
        text-decoration: none;
    }
    .resource-link:hover {
        color: #c0c0ff;
    }
    .resource-status {
        font-size: 11px;
        color: #555;
        padding: 1px 6px;
        background: #222;
        border-radius: 3px;
    }
    .btn-icon-xs {
        background: none;
        border: none;
        color: #555;
        cursor: pointer;
        padding: 2px;
        border-radius: 3px;
        display: flex;
    }
    .btn-icon-xs.danger:hover {
        color: #ef4444;
        background: #3a1a1a;
    }
    .no-resources {
        font-size: 13px;
        color: #555;
        padding: 8px 0;
    }

    /* Dialog content */

    .dialog-body {
        padding: 16px 24px;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
    .dialog-body label {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12px;
        color: #666;
    }
    .dialog-body input,
    .dialog-body textarea {
        background: #1a1a1a;
        border: 1px solid #333;
        color: #e0e0e0;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 14px;
        outline: none;
        resize: vertical;
    }
    .dialog-body input:focus,
    .dialog-body textarea:focus {
        border-color: #6366f1;
    }

    /* Dialog content */
    .btn-cancel {
        background: #2a2a2a;
        border: none;
        color: #aaa;
        padding: 8px 18px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
    }
    .btn-submit {
        background: #6366f1;
        border: none;
        color: #fff;
        padding: 8px 18px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
    }
    .btn-submit:hover {
        background: #5558e6;
    }
    .btn-submit:disabled {
        opacity: 0.5;
        cursor: default;
    }
</style>
