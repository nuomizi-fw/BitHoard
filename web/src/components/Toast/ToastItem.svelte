<script>
    import { createEventDispatcher, onMount, onDestroy } from "svelte";
    import { api } from "../../lib/api.js";
    import { showToast } from "../../lib/stores/ui.js";
    import { resources, stagingResources } from "../../lib/stores/resources.js";
    import {
        X,
        Download,
        Save,
        ChevronDown,
        Image,
        CheckCircle,
        AlertCircle,
        Info,
        Inbox,
    } from "lucide-svelte";

    export let toast;

    const dispatch = createEventDispatcher();

    let title = "";
    let description = "";
    let sourceApp = toast.sourceApp || "unknown";
    let expanded = false;
    let saving = false;

    // 截图缓存：粘贴的图片暂存在此，保存/下载时一并上传
    // { dataUrl }  — dataUrl 用于预览；上传时从 dataUrl 还原 Blob
    let screenshots = [];
    let unsubImage = null;

    function dataUrlToBlob(dataUrl) {
        const parts = dataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
        const binary = atob(parts[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }

    function removeScreenshot(idx) {
        screenshots = screenshots.filter((_, i) => i !== idx);
    }

    // 监听 Electron 后台轮询推送的剪贴板图像
    onMount(() => {
        if (window.electronAPI?.onClipboardImage) {
            unsubImage = window.electronAPI.onClipboardImage(({ dataUrl }) => {
                if (!isLinkToast) return;
                screenshots = [...screenshots, { dataUrl }];
            });
        }
    });

    onDestroy(() => {
        if (typeof unsubImage === 'function') unsubImage();
    });

    // 判断是否为磁链检测类 toast
    $: isLinkToast = !!toast.links;

    // 简单 toast 的图标
    $: typeIcon =
        toast.type === "success"
            ? "✅"
            : toast.type === "error"
              ? "❌"
              : toast.type === "info"
                ? "ℹ️"
                : "🔗";

    // 从链接提取默认标题
    $: if (toast.links && toast.links[0] && !title) {
        const link = toast.links[0];
        // 1) 尝试 dn= 参数
        const match = link.uri.match(/dn=([^&]+)/);
        if (match) {
            try {
                title = decodeURIComponent(match[1]).replace(/[+]/g, " ");
            } catch {
                title = "";
            }
        }
        // 2) 若无 dn=，尝试从上下文首行非噪音行获取
        if (!title && toast.contextText) {
            const lines = toast.contextText.split(/\r?\n/);
            for (const line of lines) {
                const t = line.trim();
                if (t && !/^magnet:\?/.test(t) && !/^https?:\/\//.test(t) && !/^[a-fA-F0-9]{32,40}$/.test(t)) {
                    title = t.substring(0, 120);
                    break;
                }
            }
        }
    }

    async function handleSave() {
        saving = true;
        try {
            const result = await api.createResources({
                links: toast.links,
                sourceApp,
                contextText: toast.contextText || "",
                suggestedTitle: title || undefined,
            });

            // 更新标题和描述，同时上传截图
            for (const r of result.results) {
                if (r.created) {
                    await api.updateResource(r.id, {
                        title: title || undefined,
                        description: description || undefined,
                        status: "active",
                    });
                    // 上传所有粘贴的截图
                    for (const shot of screenshots) {
                        try {
                            await api.uploadScreenshot(r.id, dataUrlToBlob(shot.dataUrl));
                        } catch (e) {
                            console.error("Screenshot upload error:", e);
                        }
                    }
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
                contextText: toast.contextText || "",
                suggestedTitle: title || undefined,
            });

            for (const r of result.results) {
                if (r.created) {
                    await api.updateResource(r.id, {
                        title: title || undefined,
                        description: description || undefined,
                        status: "active",
                    });
                    // 上传所有粘贴的截图
                    for (const shot of screenshots) {
                        try {
                            await api.uploadScreenshot(r.id, dataUrlToBlob(shot.dataUrl));
                        } catch (e) {
                            console.error("Screenshot upload error:", e);
                        }
                    }
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

    async function handleStaging() {
        saving = true;
        try {
            // 直接添加到暂存区，不创建资源（字段统一使用下划线风格）
            stagingResources.update(items => [
                ...items,
                ...(toast.links || []).map(link => ({
                    magnet_uri: link.uri,
                    title: title || "",
                    source_app: sourceApp,
                    context_text: toast.contextText || "",
                    suggested_title: title || "",
                    screenshots: screenshots.map(s => s.dataUrl),
                }))
            ]);
            dispatch("dismiss");
        } finally {
            saving = false;
        }
    }

</script>

{#if isLinkToast}
    <!-- 磁链检测 toast：完整编辑 UI -->
    <div class="toast" class:expanded>
        <div class="toast-header">
            <div class="toast-type-icon">🔗</div>
            <div class="toast-title">
                {toast.links.length > 1
                    ? `检测到 ${toast.links.length} 个链接`
                    : "检测到磁链"}
            </div>
            <div class="toast-actions">
                <button
                    class="btn-icon"
                    title="展开编辑"
                    on:click={() => (expanded = !expanded)}
                >
                    <span class:rotated={expanded}
                        ><ChevronDown size={16} /></span
                    >
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
                            <option value="文件资源管理器"
                                >文件资源管理器</option
                            >
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
                        <div class="screenshot-area" class:has-shots={screenshots.length > 0}>
                            {#if screenshots.length > 0}
                                <div class="screenshot-thumbs">
                                    {#each screenshots as shot, i}
                                        <div class="shot-thumb">
                                            <img src={shot.dataUrl} alt="截图 {i + 1}" />
                                            <button
                                                class="shot-remove"
                                                on:click={() => removeScreenshot(i)}
                                                title="移除"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                            <p class="screenshot-hint">
                                📋 复制图像后自动捕获为此资源的截图
                            </p>
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
            <button
                class="btn btn-staging"
                disabled={saving}
                on:click={handleStaging}
            >
                <Inbox size={14} />
                暂存
            </button>
            <button
                class="btn btn-primary"
                disabled={saving}
                on:click={handleSave}
            >
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
{:else}
    <!-- 简单通知 toast -->
    <div class="toast simple-toast">
        <div class="toast-header">
            <div class="toast-type-icon">{typeIcon}</div>
            <div class="toast-title">{toast.message || ""}</div>
            <div class="toast-actions">
                <button
                    class="btn-icon"
                    title="关闭"
                    on:click={() => dispatch("dismiss")}
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    </div>
{/if}

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

    .simple-toast .toast-header {
        border-bottom: none;
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

    .screenshot-area {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .screenshot-area.has-shots {
        border: 1px solid #333;
        border-radius: 8px;
        padding: 8px;
    }

    .screenshot-thumbs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .shot-thumb {
        position: relative;
        width: 72px;
        height: 72px;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid #3a3a3a;
    }

    .shot-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .shot-remove {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 18px;
        height: 18px;
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
    }

    .shot-thumb:hover .shot-remove {
        opacity: 1;
    }

    .screenshot-hint {
        color: #555;
        font-size: 11px;
        text-align: center;
        margin: 4px 0 0;
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

    .btn-staging {
        background: #7c3aed;
        color: white;
    }

    .btn-staging:hover:not(:disabled) {
        background: #6d28d9;
    }
</style>
