<script>
    import Sidebar from "./Sidebar.svelte";
    import ToastContainer from "./Toast/ToastContainer.svelte";
    import StagingArea from "./StagingArea.svelte";
    import { stagingExpanded, sidebarCollapsed } from "../lib/stores/ui.js";
</script>

<div class="app-layout">
    <Sidebar />
    <main class="main-content" class:collapsed={$sidebarCollapsed}>
        <div class="content-area">
            <slot />
        </div>
    </main>
</div>

<ToastContainer />
<StagingArea />

<style>
    .app-layout {
        display: flex;
        height: 100vh;
        overflow: hidden;
    }

    .main-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        margin-left: 240px;
        transition: margin-left 0.2s ease;
    }

    .main-content.collapsed {
        margin-left: 60px;
    }

    .content-area {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
    }
</style>
