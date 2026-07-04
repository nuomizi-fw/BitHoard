<script>
    import { api, setToken } from "../lib/api.js";
    import { isAuthenticated } from "../lib/stores/auth.js";

    let password = "";
    let error = "";
    let loading = false;

    async function handleLogin() {
        if (!password) return;
        loading = true;
        error = "";

        try {
            const result = await api.login(password);
            setToken(result.token);
            isAuthenticated.set(true);
        } catch (err) {
            error = "密码错误";
        } finally {
            loading = false;
        }
    }
</script>

<div class="login-page">
    <div class="login-card">
        <div class="login-icon">🧲</div>
        <h1>BitHoard</h1>
        <p class="subtitle">磁链资源管理与下载</p>

        <div class="form">
            <div class="form-group">
                <label for="password">管理员密码</label>
                <input
                    id="password"
                    type="password"
                    bind:value={password}
                    placeholder="输入密码..."
                    on:keydown={(e) => e.key === "Enter" && handleLogin()}
                />
            </div>

            {#if error}
                <div class="error-msg">{error}</div>
            {/if}

            <button
                class="btn-login"
                on:click={handleLogin}
                disabled={loading || !password}
            >
                {loading ? "登录中..." : "登录"}
            </button>
        </div>
    </div>
</div>

<style>
    .login-page {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: #0f0f0f;
    }

    .login-card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 16px;
        padding: 48px;
        width: 380px;
        text-align: center;
    }

    .login-icon {
        font-size: 56px;
        margin-bottom: 16px;
    }

    h1 {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 4px;
        color: #e0e0e0;
    }

    .subtitle {
        font-size: 14px;
        color: #666;
        margin-bottom: 32px;
    }

    .form-group {
        text-align: left;
        margin-bottom: 16px;
    }

    .form-group label {
        display: block;
        font-size: 12px;
        color: #888;
        margin-bottom: 6px;
    }

    .form-group input {
        width: 100%;
        background: #0f0f0f;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 12px;
        color: #e0e0e0;
        font-size: 15px;
        outline: none;
    }

    .form-group input:focus {
        border-color: #6366f1;
    }

    .error-msg {
        color: #ef4444;
        font-size: 13px;
        margin-bottom: 12px;
    }

    .btn-login {
        width: 100%;
        padding: 12px;
        background: #6366f1;
        border: none;
        border-radius: 8px;
        color: white;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
    }

    .btn-login:hover:not(:disabled) {
        background: #5558e6;
    }

    .btn-login:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
