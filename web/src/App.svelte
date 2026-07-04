<script>
    import { Router, Route } from "svelte-routing";
    import Layout from "./components/Layout.svelte";
    import Home from "./routes/Home.svelte";
    import ResourceDetail from "./routes/ResourceDetail.svelte";
    import Downloads from "./routes/Downloads.svelte";
    import Settings from "./routes/Settings.svelte";
    import Login from "./routes/Login.svelte";
    import { isAuthenticated } from "./lib/stores/auth.js";

    let loggedIn = false;
    isAuthenticated.subscribe((v) => (loggedIn = v));
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
