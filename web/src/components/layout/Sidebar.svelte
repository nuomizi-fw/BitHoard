<script>
    import { link } from "svelte-routing";
    import { sidebarCollapsed, stagingExpanded } from "../../lib/stores/ui.js";
    import { resources } from "../../lib/stores/resources.js";
    import {
        Home,
        Download,
        Search,
        Tag,
        FolderOpen,
        Settings,
        ChevronLeft,
        ChevronRight,
        Package,
    } from "lucide-svelte";

    const navItems = [
        { path: "/", label: "全部资源", icon: Home },
        { path: "/search", label: "搜索", icon: Search },
        { path: "/downloads", label: "下载管理", icon: Download },
        { path: "/groups", label: "分组管理", icon: FolderOpen },
        { path: "/tags", label: "标签管理", icon: Tag },
    ];

    let searchQuery = "";
</script>

<aside class="sidebar" class:collapsed={$sidebarCollapsed}>
    <div class="sidebar-header">
        {#if !$sidebarCollapsed}
            <h1 class="logo">🧲 BitHoard</h1>
        {:else}
            <h1 class="logo-icon">🧲</h1>
        {/if}
        <button
            class="collapse-btn"
            on:click={() => sidebarCollapsed.update((v) => !v)}
        >
            {#if $sidebarCollapsed}
                <ChevronRight size={16} />
            {:else}
                <ChevronLeft size={16} />
            {/if}
        </button>
    </div>

    <nav class="nav">
        {#each navItems as item}
            <a
                href={item.path}
                use:link
                class="nav-item"
                class:collapsed={$sidebarCollapsed}
            >
                <svelte:component this={item.icon} size={20} />
                {#if !$sidebarCollapsed}
                    <span>{item.label}</span>
                {/if}
            </a>
        {/each}
    </nav>

    {#if !$sidebarCollapsed}
        <div class="sidebar-section">
            <h3>快速统计</h3>
            <div class="stat-item">
                <span>总资源</span>
                <strong>{$resources.total}</strong>
            </div>
        </div>
    {/if}

    <div class="sidebar-footer">
        <a
            href="/settings"
            use:link
            class="nav-item"
            class:collapsed={$sidebarCollapsed}
        >
            <Settings size={20} />
            {#if !$sidebarCollapsed}
                <span>设置</span>
            {/if}
        </a>
    </div>
</aside>

<style>
    .sidebar {
        position: fixed;
        left: 0;
        top: 0;
        bottom: 0;
        width: 240px;
        background: #1a1a1a;
        border-right: 1px solid #2a2a2a;
        display: flex;
        flex-direction: column;
        transition: width 0.2s ease;
        z-index: 100;
    }

    .sidebar.collapsed {
        width: 60px;
    }

    .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid #2a2a2a;
    }

    .logo {
        font-size: 18px;
        font-weight: 700;
        color: #6366f1;
    }

    .logo-icon {
        font-size: 22px;
    }

    .collapse-btn {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
    }

    .collapse-btn:hover {
        background: #2a2a2a;
        color: #fff;
    }

    .nav {
        flex: 1;
        padding: 12px 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        color: #aaa;
        text-decoration: none;
        font-size: 14px;
        transition: all 0.15s;
    }

    .nav-item:hover {
        background: #2a2a2a;
        color: #fff;
    }

    .nav-item.collapsed {
        justify-content: center;
        padding: 10px;
    }

    .sidebar-section {
        padding: 16px;
        border-top: 1px solid #2a2a2a;
    }

    .sidebar-section h3 {
        font-size: 11px;
        text-transform: uppercase;
        color: #666;
        margin-bottom: 8px;
    }

    .stat-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        color: #aaa;
    }

    .sidebar-footer {
        padding: 8px;
        border-top: 1px solid #2a2a2a;
    }
</style>
