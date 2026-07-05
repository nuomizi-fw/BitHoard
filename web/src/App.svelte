<script>
    import { onMount } from "svelte";
    import { Router, Route } from "svelte-routing";
    import Layout from "./components/layout/Layout.svelte";
    import Home from "./routes/Home.svelte";
    import ResourceDetail from "./routes/ResourceDetail.svelte";
    import Downloads from "./routes/Downloads.svelte";
    import Settings from "./routes/Settings.svelte";
    import Search from "./routes/Search.svelte";
    import Groups from "./routes/Groups.svelte";
    import Tags from "./routes/Tags.svelte";
    import Login from "./routes/Login.svelte";
    import { isAuthenticated } from "./lib/stores/auth.js";
    import { initWsBridge } from "./lib/ws-bridge.js";

    let loggedIn = false;
    isAuthenticated.subscribe((v) => (loggedIn = v));

    onMount(() => {
        // 登录后连接 WebSocket 接收 qB 进度推送
        if (loggedIn) {
            initWsBridge();
        }
    });
</script>

<Router>
    {#if !loggedIn}
        <Login />
    {:else}
        <Layout>
            <Route path="/" component={Home} />
            <Route path="/resource/:id" component={ResourceDetail} />
            <Route path="/downloads" component={Downloads} />
            <Route path="/settings" component={Settings} />
            <Route path="/search" component={Search} />
            <Route path="/groups" component={Groups} />
            <Route path="/tags" component={Tags} />
        </Layout>
    {/if}
</Router>

<style>
    :global(*) {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    :global(body) {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
            "PingFang SC", "Microsoft YaHei", sans-serif;
        background: #0f0f0f;
        color: #e0e0e0;
        overflow: hidden;
        height: 100vh;
    }

    :global(#app) {
        height: 100vh;
    }

    :global(::-webkit-scrollbar) {
        width: 6px;
    }

    :global(::-webkit-scrollbar-track) {
        background: transparent;
    }

    :global(::-webkit-scrollbar-thumb) {
        background: #3a3a3a;
        border-radius: 3px;
    }

    :global(::-webkit-scrollbar-thumb:hover) {
        background: #555;
    }
</style>
