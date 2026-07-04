<script>
    import { onMount } from "svelte";
    import { api } from "../lib/api.js";
    import { clearToken } from "../lib/api.js";
    import { isAuthenticated } from "../lib/stores/auth.js";
    import { showToast } from "../lib/stores/ui.js";
    import { Server, Key, Globe, Database } from "lucide-svelte";

    let qbHost = "http://localhost:8080";
    let qbUsername = "admin";
    let qbPassword = "";
    let qbStatus = null;
    let testingQb = false;

    let ipWhitelist = "";
    let authEnabled = true;

    onMount(async () => {
        try {
            const status = await api.checkStatus();
            ipWhitelist = (status.ipWhitelist || []).join(", ");
        } catch (e) {}
    });

    async function testQbConnection() {
        testingQb = true;
        try {
            qbStatus = await api.qbStatus();
        } catch (err) {
            qbStatus = { connected: false, error: err.message };
        } finally {
            testingQb = false;
        }
    }

    function handleLogout() {
        clearToken();
        isAuthenticated.set(false);
    }
</script>

<div class="settings-page">
    <h2>设置</h2>

    <div class="settings-grid">
        <!-- qBittorrent -->
        <div class="setting-card">
            <div class="card-icon"><Server size={24} /></div>
            <h3>qBittorrent 连接</h3>
            <p class="card-desc">配置下载后端</p>
            <div class="form-group">
                <label>地址</label>
                <input
                    type="text"
                    bind:value={qbHost}
                    placeholder="http://localhost:8080"
                />
            </div>
            <div class="form-group">
                <label>用户名</label>
                <input type="text" bind:value={qbUsername} />
            </div>
            <div class="form-group">
                <label>密码</label>
                <input type="password" bind:value={qbPassword} />
            </div>
            <div class="form-actions">
                <button
                    class="btn btn-primary"
                    on:click={testQbConnection}
                    disabled={testingQb}
                >
                    {testingQb ? "测试中..." : "测试连接"}
                </button>
            </div>
            {#if qbStatus}
                <div class="status-info" class:connected={qbStatus.connected}>
                    {qbStatus.connected
                        ? `✅ 已连接 (v${qbStatus.version})`
                        : `❌ ${qbStatus.error || "连接失败"}`}
                </div>
            {/if}
        </div>

        <!-- 安全 -->
        <div class="setting-card">
            <div class="card-icon"><Key size={24} /></div>
            <h3>安全设置</h3>
            <p class="card-desc">Web 访问控制</p>
            <div class="form-group">
                <label>IP 白名单 (逗号分隔, 空=仅本地)</label>
                <input
                    type="text"
                    bind:value={ipWhitelist}
                    placeholder="127.0.0.1,192.168.1.100"
                />
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" on:click={handleLogout}
                    >退出登录</button
                >
            </div>
        </div>

        <!-- 关于 -->
        <div class="setting-card">
            <div class="card-icon"><Database size={24} /></div>
            <h3>关于 BitHoard</h3>
            <p class="card-desc">版本 0.1.0 · 开发中</p>
            <p class="about-text">
                BitHoard 是一个磁链资源管理与下载工具。<br />
                支持剪贴板监控、qBittorrent 集成、文件检索、评价系统。
            </p>
        </div>
    </div>
</div>

<style>
    .settings-page {
        max-width: 900px;
        margin: 0 auto;
    }

    .settings-page h2 {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 28px;
    }

    .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        gap: 20px;
    }

    .setting-card {
        background: #141414;
        border: 1px solid #222;
        border-radius: 12px;
        padding: 24px;
    }

    .card-icon {
        color: #6366f1;
        margin-bottom: 12px;
    }

    .setting-card h3 {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 4px;
    }

    .card-desc {
        font-size: 13px;
        color: #666;
        margin-bottom: 16px;
    }

    .form-group {
        margin-bottom: 12px;
    }

    .form-group label {
        display: block;
        font-size: 12px;
        color: #888;
        margin-bottom: 4px;
    }

    .form-group input {
        width: 100%;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 6px;
        padding: 8px 12px;
        color: #e0e0e0;
        font-size: 13px;
        outline: none;
    }

    .form-group input:focus {
        border-color: #6366f1;
    }

    .form-actions {
        margin-top: 16px;
    }

    .btn {
        padding: 8px 16px;
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
    .btn-primary:disabled {
        opacity: 0.5;
    }
    .btn-secondary {
        background: #2a2a2a;
        color: #aaa;
    }
    .btn-secondary:hover {
        background: #3a3a3a;
    }

    .status-info {
        margin-top: 12px;
        font-size: 13px;
        color: #ef4444;
    }

    .status-info.connected {
        color: #22c55e;
    }

    .about-text {
        font-size: 13px;
        color: #888;
        line-height: 1.6;
    }
</style>
