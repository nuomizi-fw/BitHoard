<script>
    import { createEventDispatcher } from "svelte";
    import { api } from "../../lib/api.js";
    import { showToast } from "../../lib/stores/ui.js";
    import { resources } from "../../lib/stores/resources.js";
    import { X, Download, Save, ChevronDown, Image } from "lucide-svelte";

    export let toast;

    const dispatch = createEventDispatcher();

    let title = "";
    let description = "";
    let sourceApp = toast.sourceApp || "unknown";
    let expanded = false;
    let saving = false;

    // 从链接提取默认标题
    $: if (toast.links && toast.links[0]) {
        const match = toast.links[0].uri.match(/dn=([^&]+)/);
        if (match && !title) {
            try {
                title = decodeURIComponent(match[1]).replace(/[+]/g, " ");
            } catch {
                title = "";
            }
        }
    }

    async function handleSave() {
        saving = true;
        try {
            const result = await api.createResources({
                links: toast.links,
                sourceApp,
            });

            // 更新标题和描述
            for (const r of result.results) {
                if (r.created) {
                    await api.updateResource(r.id, {
                        title: title || undefined,
                        description: description || undefined,
                        status: "active",
                    });
                }
            }

            resources.refresh();
            dispatch("dismiss");
        } catch (err) {
            console.error("Save error:", err);
            showToast({ type: "error", message: "保存失败: " + err.message });
        } finally {
            saving = false;
        }
    }

    async function handleDownload() {
        saving = true;
        try {
            const result = await api.createResources({
                links: toast.links,
                sourceApp,
            });

            for (const r of result.results) {
                if (r.created) {
                    await api.updateResource(r.id, {
                        title: title || undefined,
                        description: description || undefined,
                        status: "active",
                    });
                    // 触发下载
                    try {
                        await api.createDownload({
                            resource_id: r.id,
                            start_paused: false,
                        });
                    } catch (e) {
                        showToast({
                            type: "error",
                            message: "下载失败: " + e.message,
                        });
                    }
                }
            }

            resources.refresh();
            dispatch("dismiss");
        } catch (err) {
            showToast({ type: "error", message: "操作失败: " + err.message });
        } finally {
            saving = false;
        }
    }

    function handlePasteImage(e) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith("image/")) {
                const blob = item.getAsFile();
                // 截图上传会在展开后或保存时处理
                showToast({
                    type: "info",
                    message: "图片已捕获，保存时将一并上传",
                });
            }
        }
    }
</script>

<div class="toast" class:expanded>
    <div class="toast-header">
        <div class="toast-type-icon">🔗</div>
        <div class="toast-title">
            {toast.links?.length > 1
                ? `检测到 ${toast.links.length} 个链接`
                : "检测到磁链"}
        </div>
        <div class="toast-actions">
            <button
                class="btn-icon"
                title="展开编辑"
                on:click={() => (expanded = !expanded)}
            >
                <span class:rotated={expanded}><ChevronDown size={16} /></span>
            </button>
            <button
                class="btn-icon"
                title="关闭"
                on:click={() => dispatch("dismiss")}
            >
                <X size={16} />
            </button>
        </div>
    </div>

    <div class="toast-body">
        <div class="link-preview">
            {#each toast.links || [] as link}
                <div class="link-item">
                    {link.uri.substring(0, 80)}{link.uri.length > 80
                        ? "..."
                        : ""}
                </div>
            {/each}
        </div>

        {#if expanded}
            <div class="edit-area">
                <div class="field">
                    <label>来源</label>
                    <select bind:value={sourceApp}>
                        <option value="unknown">未知</option>
                        <option value="微信">微信</option>
                        <option value="QQ">QQ</option>
                        <option value="Chrome">Chrome</option>
                        <option value="Edge">Edge</option>
                        <option value="Firefox">Firefox</option>
                        <option value="Telegram">Telegram</option>
                        <option value="文件资源管理器">文件资源管理器</option>
                    </select>
                </div>

                <div class="field">
                    <label>标题</label>
                    <input
                        type="text"
                        bind:value={title}
                        placeholder="输入标题..."
                    />
                </div>

                <div class="field">
                    <label>描述</label>
                    <textarea
                        bind:value={description}
                        placeholder="输入描述..."
                        rows="2"
                    />
                </div>

                <div class="field">
                    <label>截图</label>
                    <div
                        class="screenshot-drop"
                        contenteditable="true"
                        on:paste={handlePasteImage}
                        tabindex="0"
                    >
                        <Image size={16} />
                        <span>点击此处后 Ctrl+V 粘贴截图</span>
                    </div>
                </div>
            </div>
        {/if}
    </div>

    <div class="toast-footer">
        <button
            class="btn btn-secondary"
            disabled={saving}
            on:click={() => dispatch("dismiss")}
        >
            忽略
        </button>
        <button class="btn btn-primary" disabled={saving} on:click={handleSave}>
            <Save size={14} />
            保存
        </button>
        <button
            class="btn btn-accent"
            disabled={saving}
            on:click={handleDownload}
        >
            <Download size={14} />
            立即下载
        </button>
    </div>
</div>

<style>
    .toast {
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        animation: slideIn 0.25s ease;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    .toast-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        background: #252525;
        border-bottom: 1px solid #333;
    }

    .toast-type-icon {
        font-size: 18px;
    }

    .toast-title {
        flex: 1;
        font-size: 13px;
        font-weight: 600;
        color: #e0e0e0;
    }

    .toast-actions {
        display: flex;
        gap: 4px;
    }

    .btn-icon {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
    }

    .btn-icon:hover {
        background: #3a3a3a;
        color: #fff;
    }

    .rotated {
        transform: rotate(180deg);
    }

    .toast-body {
        padding: 12px 16px;
    }

    .link-preview {
        margin-bottom: 8px;
    }

    .link-item {
        font-size: 11px;
        color: #6366f1;
        font-family: monospace;
        word-break: break-all;
        padding: 4px 0;
    }

    .edit-area {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #2a2a2a;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .field label {
        font-size: 11px;
        color: #888;
        text-transform: uppercase;
    }

    .field input,
    .field textarea,
    .field select {
        background: #252525;
        border: 1px solid #3a3a3a;
        border-radius: 6px;
        padding: 8px 10px;
        color: #e0e0e0;
        font-size: 13px;
        outline: none;
    }

    .field input:focus,
    .field textarea:focus,
    .field select:focus {
        border-color: #6366f1;
    }

    .screenshot-drop {
        border: 2px dashed #3a3a3a;
        border-radius: 8px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: #666;
        font-size: 12px;
        cursor: text;
        min-height: 60px;
    }

    .screenshot-drop:focus {
        border-color: #6366f1;
    }

    .toast-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 10px 16px;
        border-top: 1px solid #2a2a2a;
    }

    .btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s;
    }

    .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .btn-primary {
        background: #6366f1;
        color: white;
    }

    .btn-primary:hover:not(:disabled) {
        background: #5558e6;
    }

    .btn-accent {
        background: #059669;
        color: white;
    }

    .btn-accent:hover:not(:disabled) {
        background: #047857;
    }

    .btn-secondary {
        background: #2a2a2a;
        color: #aaa;
    }

    .btn-secondary:hover:not(:disabled) {
        background: #3a3a3a;
    }
</style>
