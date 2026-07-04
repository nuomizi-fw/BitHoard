<script>
    import { onMount, onDestroy } from "svelte";
    import { api } from "../lib/api.js";
    import { downloads, qbProgress } from "../lib/stores/downloads.js";
    import {
        Download,
        Pause,
        Play,
        Trash2,
        RefreshCw,
        HardDrive,
    } from "lucide-svelte";
    import { showToast } from "../lib/stores/ui.js";

    let qbConnected = false;
    let qbVersion = "";

    onMount(async () => {
        downloads.fetch();
        try {
            const status = await api.qbStatus();
            qbConnected = status.connected;
            qbVersion = status.version || "";
        } catch (e) {
            /* qB 未连接 */
        }
    });

    function formatSize(bytes) {
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

<div class="downloads-page">
    <div class="page-header">
        <div>
            <h2>下载管理</h2>
            <span class="qb-status" class:connected={qbConnected}>
                {qbConnected
                    ? `🟢 qBittorrent ${qbVersion}`
                    : "🔴 qBittorrent 未连接"}
            </span>
        </div>
        <button class="btn-refresh" on:click={() => downloads.fetch()}>
            <RefreshCw size={16} /> 刷新
        </button>
    </div>

    {#if $downloads.loading}
        <div class="loading">加载中...</div>
    {:else if $downloads.items.length === 0}
        <div class="empty">
            <Download size={48} class="empty-icon" />
            <p>暂无下载任务</p>
        </div>
    {:else}
        <div class="download-list">
            {#each $downloads.items as dl}
                <div class="download-item">
                    <div class="dl-main">
                        <h4>{dl.title || "未知资源"}</h4>
                        <div class="dl-meta">
                            <span class={`dl-status ${dl.download_status}`}
                                >{dl.download_status}</span
                            >
                            <span>{formatSize(dl.total_size)}</span>
                            <span>{dl.download_path || "默认路径"}</span>
                        </div>
                    </div>
                    <div class="dl-progress">
                        <div class="progress-bar">
                            <div
                                class="progress-fill"
                                style="width: {dl.downloaded_size &&
                                dl.total_size
                                    ? (
                                          (dl.downloaded_size / dl.total_size) *
                                          100
                                      ).toFixed(1)
                                    : 0}%"
                            />
                        </div>
                        <span class="progress-text">
                            {dl.downloaded_size
                                ? formatSize(dl.downloaded_size)
                                : 0} / {formatSize(dl.total_size)}
                        </span>
                    </div>
                    <div class="dl-actions">
                        <!-- <button><Pause size={14} /></button> -->
                        <button
                            on:click={async () => {
                                await api.deleteDownload(dl.id, true, false);
                                downloads.fetch();
                                showToast({
                                    type: "info",
                                    message: "已删除下载任务",
                                });
                            }}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .downloads-page {
        max-width: 1000px;
        margin: 0 auto;
    }

    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 24px;
    }

    .page-header h2 {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 4px;
    }

    .qb-status {
        font-size: 12px;
        color: #ef4444;
    }

    .qb-status.connected {
        color: #22c55e;
    }

    .btn-refresh {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #2a2a2a;
        border: none;
        color: #aaa;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
    }

    .btn-refresh:hover {
        background: #3a3a3a;
    }

    .download-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .download-item {
        background: #141414;
        border-radius: 10px;
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .dl-main {
        flex: 1;
    }

    .dl-main h4 {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 4px;
    }

    .dl-meta {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: #666;
    }

    .dl-status {
        padding: 1px 8px;
        border-radius: 4px;
        font-size: 11px;
    }

    .dl-status.pending {
        background: #3a3a1a;
        color: #a0a000;
    }
    .dl-status.downloading {
        background: #1a3a3a;
        color: #00a0a0;
    }
    .dl-status.completed {
        background: #1a3a1a;
        color: #00a000;
    }
    .dl-status.paused {
        background: #2a2a1a;
        color: #a0a000;
    }
    .dl-status.deleted {
        background: #3a1a1a;
        color: #a00000;
    }

    .dl-progress {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 200px;
    }

    .progress-bar {
        flex: 1;
        height: 6px;
        background: #2a2a2a;
        border-radius: 3px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: #6366f1;
        border-radius: 3px;
        transition: width 0.3s;
    }

    .progress-text {
        font-size: 11px;
        color: #666;
        font-family: monospace;
        white-space: nowrap;
    }

    .dl-actions {
        display: flex;
        gap: 4px;
    }

    .dl-actions button {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 6px;
        border-radius: 4px;
    }

    .dl-actions button:hover {
        background: #2a2a2a;
        color: #fff;
    }

    .empty {
        text-align: center;
        padding: 60px;
        color: #666;
    }

    .empty-icon {
        margin-bottom: 16px;
        opacity: 0.3;
    }
</style>
