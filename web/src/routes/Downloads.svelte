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
        Wifi,
        WifiOff,
    } from "lucide-svelte";
    import { showToast } from "../lib/stores/ui.js";
    import { wsClient } from "../lib/ws.js";

    let qbConnected = false;
    let qbVersion = "";
    let transferInfo = null; // { dl_info_speed, up_info_speed }

    // 从 WebSocket 实时进度映射 hash→进度信息
    $: progressMap = $qbProgress?.torrents || {};

    onMount(async () => {
        downloads.fetch();
        try {
            const status = await api.qbStatus();
            qbConnected = status.connected;
            qbVersion = status.version || "";
        } catch (e) {
            /* qB 未连接 */
        }

        // 订阅 WebSocket qB 状态变化
        wsClient.on("qb:status", (msg) => {
            qbConnected =
                msg?.connected ??
                msg?.server_state?.connection_status === "connected";
            if (msg?.server_state) {
                transferInfo = {
                    dlSpeed: msg.server_state.dl_info_speed || 0,
                    upSpeed: msg.server_state.up_info_speed || 0,
                };
            }
        });

        wsClient.on("connected", async () => {
            qbConnected = true;
            // 重连后刷新一次状态
            try {
                const status = await api.qbStatus();
                qbConnected = status.connected;
                qbVersion = status.version || "";
            } catch {}
            downloads.fetch();
        });

        wsClient.on("disconnected", () => {
            qbConnected = false;
            transferInfo = null;
        });
    });

    // 合并数据库下载记录与 WebSocket 实时进度
    $: enrichedDownloads = $downloads.items.map((dl) => {
        const hash = dl.torrent_hash;
        const progress = hash ? progressMap[hash] : null;
        if (progress) {
            return {
                ...dl,
                _progress: (progress.progress || 0) * 100,
                _dlspeed: progress.dlspeed || 0,
                _upspeed: progress.upspeed || 0,
                _state: progress.state || dl.download_status,
                _num_seeds: progress.num_seeds || 0,
                _num_leechs: progress.num_leechs || 0,
                _eta: progress.eta || 0,
            };
        }
        return { ...dl, _progress: null };
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

    function formatSpeed(bytesPerSec) {
        if (!bytesPerSec || bytesPerSec === 0) return "";
        return formatSize(bytesPerSec) + "/s";
    }

    function formatETA(seconds) {
        if (!seconds || seconds <= 0 || seconds >= 8640000) return "";
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }

    function stateLabel(state) {
        const map = {
            downloading: "下载中",
            stalledDL: "等待中",
            uploading: "做种中",
            pausedUP: "完成",
            pausedDL: "已暂停",
            queuedDL: "排队中",
            queuedUP: "排队中",
            checkingUP: "校验中",
            checkingDL: "校验中",
            allocating: "分配中",
            metaDL: "获取元数据",
            error: "错误",
            missingFiles: "文件缺失",
            unknown: "未知",
        };
        return map[state] || state;
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
        <div class="header-right">
            {#if transferInfo}
                <span class="transfer-info">
                    ↓ {formatSpeed(transferInfo.dlSpeed)} ↑ {formatSpeed(
                        transferInfo.upSpeed,
                    )}
                </span>
            {/if}
            <button class="btn-refresh" on:click={() => downloads.fetch()}>
                <RefreshCw size={16} /> 刷新
            </button>
        </div>
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
            {#each enrichedDownloads as dl}
                <div
                    class="download-item"
                    class:completed={dl._state === "pausedUP" ||
                        dl._state === "uploading"}
                >
                    <div class="dl-main">
                        <h4>{dl.title || "未知资源"}</h4>
                        <div class="dl-meta">
                            <span
                                class="dl-status {dl._state ||
                                    dl.download_status}"
                                >{stateLabel(
                                    dl._state || dl.download_status,
                                )}</span
                            >
                            <span>{formatSize(dl.total_size)}</span>
                            {#if dl._num_seeds > 0}
                                <span>种子 {dl._num_seeds}</span>
                            {/if}
                            <span>{dl.download_path || "默认路径"}</span>
                        </div>
                    </div>
                    <div class="dl-progress">
                        <div class="progress-bar">
                            <div
                                class="progress-fill"
                                class:completed={dl._state === "pausedUP" ||
                                    dl._state === "uploading"}
                                style="width: {dl._progress != null
                                    ? dl._progress.toFixed(1)
                                    : dl.downloaded_size && dl.total_size
                                      ? (
                                            (dl.downloaded_size /
                                                dl.total_size) *
                                            100
                                        ).toFixed(1)
                                      : 0}%"
                            />
                        </div>
                        <div class="progress-detail">
                            <span class="progress-text">
                                {dl._dlspeed
                                    ? `↓ ${formatSpeed(dl._dlspeed)}`
                                    : ""}
                                {dl._upspeed
                                    ? ` ↑ ${formatSpeed(dl._upspeed)}`
                                    : ""}
                            </span>
                            {#if dl._eta > 0}
                                <span class="progress-eta"
                                    >剩余 {formatETA(dl._eta)}</span
                                >
                            {/if}
                        </div>
                    </div>
                    <div class="dl-actions">
                        {#if dl.torrent_hash}
                            {#if dl._state === "pausedDL" || dl._state === "pausedUP"}
                                <button
                                    on:click={async () => {
                                        await api.qbResume(dl.torrent_hash);
                                        downloads.fetch();
                                        showToast({
                                            type: "info",
                                            message: "已恢复",
                                        });
                                    }}
                                    title="恢复"
                                >
                                    <Play size={14} />
                                </button>
                            {:else if dl._state && dl._state !== "pausedDL" && dl._state !== "pausedUP" && dl._state !== "unknown"}
                                <button
                                    on:click={async () => {
                                        await api.qbPause(dl.torrent_hash);
                                        downloads.fetch();
                                        showToast({
                                            type: "info",
                                            message: "已暂停",
                                        });
                                    }}
                                    title="暂停"
                                >
                                    <Pause size={14} />
                                </button>
                            {/if}
                        {/if}
                        <button
                            on:click={async () => {
                                if (dl.torrent_hash) {
                                    await api.qbDelete(dl.torrent_hash, false);
                                }
                                await api.deleteDownload(dl.id, true, false);
                                downloads.fetch();
                                showToast({
                                    type: "info",
                                    message: "已删除下载任务",
                                });
                            }}
                            title="删除"
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

    .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .transfer-info {
        font-size: 12px;
        color: #888;
        font-family: monospace;
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

    .download-item.completed {
        opacity: 0.7;
    }

    .dl-main {
        flex: 1;
        min-width: 0;
    }

    .dl-main h4 {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .dl-meta {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: #666;
        flex-wrap: wrap;
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
    .dl-status.completed,
    .dl-status.pausedUP,
    .dl-status.uploading {
        background: #1a3a1a;
        color: #22c55e;
    }
    .dl-status.pausedDL {
        background: #2a2a1a;
        color: #a0a000;
    }
    .dl-status.stalledDL,
    .dl-status.queuedDL,
    .dl-status.queuedUP {
        background: #2a2a2a;
        color: #888;
    }
    .dl-status.error,
    .dl-status.missingFiles {
        background: #3a1a1a;
        color: #ef4444;
    }
    .dl-status.deleted {
        background: #3a1a1a;
        color: #a00000;
    }

    .dl-progress {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 180px;
    }

    .progress-bar {
        width: 100%;
        height: 6px;
        background: #2a2a2a;
        border-radius: 3px;
        overflow: hidden;
    }

    .progress-fill {
        height: 100%;
        background: #6366f1;
        border-radius: 3px;
        transition: width 0.5s ease;
    }

    .progress-fill.completed {
        background: #22c55e;
    }

    .progress-detail {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #888;
    }

    .progress-text {
        color: #aaa;
        font-family: monospace;
    }

    .progress-eta {
        color: #666;
    }

    .dl-actions {
        display: flex;
        gap: 6px;
    }

    .dl-actions button {
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
    }

    .dl-actions button:hover {
        background: #2a2a2a;
        color: #ef4444;
    }

    .loading,
    .empty {
        text-align: center;
        padding: 60px 20px;
        color: #555;
    }

    .empty-icon {
        margin-bottom: 16px;
        opacity: 0.3;
    }

    .empty p {
        font-size: 14px;
    }
</style>
