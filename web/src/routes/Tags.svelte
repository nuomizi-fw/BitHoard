<script>
    import { onMount } from "svelte";
    import { api } from "../lib/api.js";
    import { showToast } from "../lib/stores/ui.js";
    import { Tag, Plus, X, Edit3, Trash2 } from "lucide-svelte";

    let tags = [];
    let loading = true;
    let showDialog = false;
    let editingTag = null;

    let formName = "";
    let formColor = "#6366f1";
    let saving = false;

    const colorPalette = [
        "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
        "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899",
        "#f43f5e", "#14b8a6", "#64748b", "#6b7280", "#78716c",
    ];

    onMount(loadTags);

    async function loadTags() {
        loading = true;
        try {
            tags = await api.getTags();
        } catch (err) {
            showToast({ type: "error", message: "加载标签失败" });
        }
        loading = false;
    }

    function openCreate() {
        editingTag = null;
        formName = "";
        formColor = "#6366f1";
        showDialog = true;
    }

    function openEdit(tag) {
        editingTag = tag;
        formName = tag.name;
        formColor = tag.color || "#6366f1";
        showDialog = true;
    }

    async function saveTag() {
        if (!formName.trim()) return;
        saving = true;
        try {
            if (editingTag) {
                await api.updateTag(editingTag.id, { name: formName.trim(), color: formColor });
                showToast({ type: "info", message: "标签已更新" });
            } else {
                await api.createTag(formName.trim(), formColor);
                showToast({ type: "info", message: "标签已创建" });
            }
            showDialog = false;
            await loadTags();
        } catch (err) {
            showToast({ type: "error", message: "保存失败: " + err.message });
        }
        saving = false;
    }

    async function deleteTag(tag) {
        if (!confirm(`确定删除标签"${tag.name}"吗？此操作会从所有资源中移除该标签。`)) return;
        try {
            await api.deleteTag(tag.id);
            showToast({ type: "info", message: "标签已删除" });
            await loadTags();
        } catch (err) {
            showToast({ type: "error", message: "删除失败" });
        }
    }
</script>

<div class="tags-page">
    <div class="page-header">
        <div class="header-left">
            <h2>标签管理</h2>
            <span class="count">{tags.length} 个标签</span>
        </div>
        <button class="btn-add" on:click={openCreate}>
            <Plus size={16} /> 新建标签
        </button>
    </div>

    {#if loading}
        <div class="loading">加载中...</div>
    {:else if tags.length === 0}
        <div class="empty">
            <Tag size={48} />
            <p>暂无标签</p>
            <p class="hint">创建标签来分类你的资源，比如"必看"、"经典"、"待整理"</p>
        </div>
    {:else}
        <div class="tag-grid">
            {#each tags as tagItem (tagItem.id)}
                <div class="tag-card" style="border-left: 3px solid {tagItem.color || '#6366f1'};">
                    <div class="tag-info">
                        <div class="tag-name">
                            <span class="tag-dot" style="background: {tagItem.color || '#6366f1'};"></span>
                            <h3>{tagItem.name}</h3>
                        </div>
                        <span class="tag-count">{tagItem.resource_count || 0} 个资源</span>
                    </div>
                    <div class="tag-actions">
                        <button class="btn-icon-sm" on:click={() => openEdit(tagItem)} title="编辑"><Edit3 size={14} /></button>
                        <button class="btn-icon-sm danger" on:click={() => deleteTag(tagItem)} title="删除"><Trash2 size={14} /></button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- 新建/编辑对话框 -->
{#if showDialog}
    <div class="dialog-overlay" on:click|self={() => (showDialog = false)}>
        <div class="dialog">
            <div class="dialog-header">
                <h3>{editingTag ? "编辑标签" : "新建标签"}</h3>
                <button class="btn-close" on:click={() => (showDialog = false)}><X size={18} /></button>
            </div>
            <div class="dialog-body">
                <label>
                    名称
                    <input type="text" bind:value={formName} placeholder="标签名称" />
                </label>
                <label>
                    颜色
                    <div class="color-palette">
                        {#each colorPalette as c}
                            <button
                                class="color-swatch"
                                class:active={formColor === c}
                                style="background: {c};"
                                on:click={() => (formColor = c)}
                            ></button>
                        {/each}
                    </div>
                    <div class="custom-color">
                        <input type="color" bind:value={formColor} />
                        <span class="color-hex">{formColor}</span>
                    </div>
                </label>
                <div class="preview">
                    <span class="preview-label">预览</span>
                    <span class="preview-tag" style="background: {formColor}22; color: {formColor}; border-color: {formColor}44;">
                        {formName || "标签预览"}
                    </span>
                </div>
            </div>
            <div class="dialog-footer">
                <button class="btn-cancel" on:click={() => (showDialog = false)}>取消</button>
                <button class="btn-submit" on:click={saveTag} disabled={saving || !formName.trim()}>
                    {saving ? "保存中..." : "保存"}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .tags-page { max-width: 900px; margin: 0 auto; }

    .page-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
    }
    .header-left { display: flex; align-items: baseline; gap: 12px; }
    .header-left h2 { font-size: 22px; color: #e0e0e0; }
    .count { font-size: 13px; color: #666; }

    .btn-add {
        display: flex; align-items: center; gap: 6px;
        background: #6366f1; color: #fff; border: none;
        border-radius: 8px; padding: 8px 16px; font-size: 14px; cursor: pointer;
    }
    .btn-add:hover { background: #5558e6; }

    .loading, .empty { text-align: center; padding: 60px 20px; color: #666; }
    .empty p { margin-top: 12px; }
    .empty .hint { font-size: 13px; color: #444; }

    .tag-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;
    }

    .tag-card {
        display: flex; align-items: center; justify-content: space-between;
        background: #141414; border: 1px solid #222; border-radius: 10px;
        padding: 14px 18px; gap: 12px;
    }
    .tag-card:hover { border-color: #333; }

    .tag-info { flex: 1; min-width: 0; }
    .tag-name { display: flex; align-items: center; gap: 8px; }
    .tag-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .tag-info h3 { font-size: 15px; color: #e0e0e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tag-count { font-size: 12px; color: #555; margin-top: 2px; display: block; }

    .tag-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .btn-icon-sm {
        background: none; border: none; color: #555; cursor: pointer;
        padding: 4px; border-radius: 4px; display: flex;
    }
    .btn-icon-sm:hover { background: #2a2a2a; color: #aaa; }
    .btn-icon-sm.danger:hover { color: #ef4444; background: #3a1a1a; }

    /* Dialog */
    .dialog-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .dialog {
        background: #1e1e1e; border: 1px solid #333; border-radius: 12px;
        width: 460px; max-width: 90vw;
    }
    .dialog-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 20px 24px 0;
    }
    .dialog-header h3 { font-size: 18px; color: #e0e0e0; }
    .btn-close {
        background: none; border: none; color: #666; cursor: pointer;
        padding: 4px; border-radius: 4px; display: flex;
    }
    .btn-close:hover { color: #aaa; background: #2a2a2a; }

    .dialog-body { padding: 16px 24px; display: flex; flex-direction: column; gap: 14px; }
    .dialog-body label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #666; }
    .dialog-body input[type="text"] {
        background: #1a1a1a; border: 1px solid #333; color: #e0e0e0;
        padding: 8px 12px; border-radius: 8px; font-size: 14px; outline: none;
    }
    .dialog-body input[type="text"]:focus { border-color: #6366f1; }

    .color-palette { display: flex; flex-wrap: wrap; gap: 6px; }
    .color-swatch {
        width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent;
        cursor: pointer; transition: transform 0.1s;
    }
    .color-swatch:hover { transform: scale(1.15); }
    .color-swatch.active { border-color: #fff; transform: scale(1.15); }

    .custom-color { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .custom-color input[type="color"] {
        width: 32px; height: 32px; border: none; cursor: pointer; padding: 0;
        border-radius: 6px; background: none;
    }
    .color-hex { font-size: 12px; color: #666; font-family: monospace; }

    .preview { display: flex; align-items: center; gap: 8px; }
    .preview-label { font-size: 11px; color: #555; }
    .preview-tag {
        font-size: 12px; padding: 3px 10px; border-radius: 12px;
        border: 1px solid; font-weight: 500;
    }

    .dialog-footer {
        display: flex; gap: 8px; justify-content: flex-end;
        padding: 12px 24px 20px;
    }
    .btn-cancel {
        background: #2a2a2a; border: none; color: #aaa;
        padding: 8px 18px; border-radius: 8px; font-size: 14px; cursor: pointer;
    }
    .btn-submit {
        background: #6366f1; border: none; color: #fff;
        padding: 8px 18px; border-radius: 8px; font-size: 14px; cursor: pointer;
    }
    .btn-submit:hover { background: #5558e6; }
    .btn-submit:disabled { opacity: 0.5; cursor: default; }
</style>
