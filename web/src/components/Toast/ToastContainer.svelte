<script>
    import { toasts, dismissToast } from "../../lib/stores/ui.js";
    import ToastItem from "./ToastItem.svelte";
</script>

<div class="toast-container">
    {#each $toasts as toast (toast.id)}
        <ToastItem {toast} on:dismiss={() => dismissToast(toast.id)} />
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10000;
        display: flex;
        flex-direction: column-reverse;
        gap: 12px;
        max-width: 480px;
        pointer-events: none;
    }

    .toast-container > :global(*) {
        pointer-events: auto;
    }
</style>
