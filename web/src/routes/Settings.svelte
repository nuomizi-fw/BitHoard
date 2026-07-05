<script>
    import { onMount } from "svelte";
    import { api } from "../lib/api.js";
    import { clearToken } from "../lib/api.js";
    import { getToken } from "../lib/api.js";
    import { isAuthenticated } from "../lib/stores/auth.js";
    import { showToast } from "../lib/stores/ui.js";
    import { Server, Key, Globe, Database, Save, HardDrive, Upload, Download } from "lucide-svelte";

    let qbHost = "http://localhost:8080";
    let qbUsername = "admin";
    let qbPassword = "";
    let qbStatus = null;
    let testingQb = false;
    let savingQb = false;

    let ipWhitelist = "";
    let savingIp = false;

    // 备份恢复
    let exporting = false;
    let importing = false;
    let importMode = "merge";
    let importFile = null;

    onMount(async () => {
        try {
            const config = await api.qbConfig();
            if (config) {
                qbHost = config.qbHost || qbHost;
                qbUsername = config.qbUsername || qbUsername;
                ipWhitelist = (config.ipWhitelist || []).join(", ");
            }
        } catch (e) {
            // 回退：从 status 获取 IP 白名单
            try {
                const status = await api.checkStatus();
                ipWhitelist = (status.ipWhitelist || []).join(", ");
            } catch {}
        }
    });

    async function testQbConnection() {
        testingQb = true;
        qbStatus = null;
        try {
            qbStatus = await api.qbStatus();
        } catch (err) {
            qbStatus = { connected: false, error: err.message };
        } finally {
            testingQb = false;
        }
    }

    async function saveQbConfig() {
        savingQb = true;
        try {
            await api.updateConfig({
                qbHost,
                qbUsername,
                qbPassword: qbPassword || undefined,
            });
            showToast({ type: "success", message: "qBittorrent 配置已保存" });
            // 保存后清除密码字段
            qbPassword = "";
        } catch (err) {
            showToast({ type: "error", message: "保存失败: " + err.message });
        } finally {
            savingQb = false;
        }
    }

    async function saveIpWhitelist() {
        savingIp = true;
        try {
            await api.updateConfig({ ipWhitelist });
            showToast({ type: "success", message: "IP 白名单已更新" });
        } catch (err) {
            showToast({ type: "error", message: "保存失败: " + err.message });
        } finally {
            savingIp = false;
        }
    }

    function handleLogout() {
        clearToken();
        isAuthenticated.set(false);
    }

    function handleExport() {
        // 使用 window.open 触发下载
        const token = getToken();
        // 创建隐藏的下载链接触发下载
        const link = document.createElement('a');
        link.href = api.exportData(true);
        // 添加认证头通过 URL 不行，需要用 fetch + blob
        fetch(api.exportData(true), {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bithoard-export-${Date.now()}.bithoard`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast({ type: "success", message: "数据已导出" });
        })
        .catch(err => showToast({ type: "error", message: "导出失败: " + err.message }));
    }

    function handleFileSelect(e) {
        importFile = e.target.files[0] || null;
    }

    async function handleImport() {
        if (!importFile) return;
        importing = true;
        try {
            const result = await api.importData(importFile, importMode);
            if (result.success) {
                showToast({ type: "success", message: `导入成功 (模式: ${importMode === 'replace' ? '替换' : '合并'})` });
                importFile = null;
                // 重置 file input
                const fileInput = document.getElementById('import-file-input');
                if (fileInput) fileInput.value = '';
            } else {
                showToast({ type: "error", message: "导入失败: " + (result.message || result.error || '未知错误') });
            }
        } catch (err) {
            showToast({ type: "error", message: "导入失败: " + err.message });
        }
        importing = false;
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
                <label>密码 (留空不修改)</label>
                <input type="password" bind:value={qbPassword} placeholder="输入新密码" />
            </div>
            <div class="form-actions">
                <button
                    class="btn btn-primary"
                    on:click={testQbConnection}
                    disabled={testingQb}
                >
                    {testingQb ? "测试中..." : "测试连接"}
                </button>
                <button
                    class="btn btn-secondary"
                    on:click={saveQbConfig}
                    disabled={savingQb}
                >
                    <Save size={14} />
                    {savingQb ? "保存中..." : "保存配置"}
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
                <label>IP 白名单 (逗号分隔, 本地地址始终允许)</label>
                <input
                    type="text"
                    bind:value={ipWhitelist}
                    placeholder="127.0.0.1, 192.168.1.100"
                />
            </div>
            <div class="form-actions">
                <button
                    class="btn btn-secondary"
                    on:click={saveIpWhitelist}
                    disabled={savingIp}
                >
                    <Save size={14} />
                    {savingIp ? "保存中..." : "保存白名单"}
                </button>
                <button class="btn btn-danger" on:click={handleLogout}
                    >退出登录</button
                >
            </div>
        </div>

        <!-- 备份恢复 -->
        <div class="setting-card">
            <div class="card-icon"><HardDrive size={24} /></div>
            <h3>备份与恢复</h3>
            <p class="card-desc">导出/导入所有数据（包含截图）</p>

            <div class="form-actions backup-actions">
                <button class="btn btn-primary" on:click={handleExport}>
                    <Download size={14} /> 导出数据
                </button>
            </div>

            <div class="divider"></div>

            <div class="form-group">
                <label>导入模式</label>
                <select bind:value={importMode} class="import-select">
                    <option value="merge">合并 (保留现有 + 新增)</option>
                    <option value="replace">替换 (清空后导入)</option>
                </select>
            </div>
            <div class="form-group">
                <label>选择 .bithoard 备份文件</label>
                <input id="import-file-input" type="file" accept=".bithoard" on:change={handleFileSelect} class="file-input" />
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" on:click={handleImport} disabled={importing || !importFile}>
                    <Upload size={14} /> {importing ? "导入中..." : "开始导入"}
                </button>
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

    .backup-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .divider {
        height: 1px; background: #2a2a2a; margin: 16px 0;
    }
    .import-select {
        width: 100%; background: #1a1a1a; border: 1px solid #333; color: #e0e0e0;
        padding: 8px 12px; border-radius: 6px; font-size: 13px; outline: none;
    }
    .file-input {
        width: 100%; font-size: 12px; color: #888;
    }
    .file-input::file-selector-button {
        background: #2a2a2a; border: none; color: #aaa;
        padding: 6px 14px; border-radius: 4px; margin-right: 8px; cursor: pointer;
    }
    .btn-danger {
        background: #3a1a1a; color: #ef4444; padding: 8px 16px;
        border: none; border-radius: 8px; font-size: 13px; cursor: pointer;
    }
    .btn-danger:hover { background: #4a1a1a; }
</style>
