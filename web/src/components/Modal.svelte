<script>
    import { createEventDispatcher } from "svelte";
    import { X } from "lucide-svelte";

    export let show = false;
    export let title = "";

    const dispatch = createEventDispatcher();

    function close() {
        dispatch("close");
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        on:click|self={close}
        role="dialog"
        aria-modal="true"
    >
        <div class="modal">
            <div class="modal-header">
                <h3>{title}</h3>
                <button class="modal-close" on:click={close} aria-label="关闭">
                    <X size={18} />
                </button>
            </div>
            <div class="modal-body">
                <slot />
            </div>
            {#if $$slots.footer}
                <div class="modal-footer">
                    <slot name="footer" />
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: #1e1e1e;
        border: 1px solid #333;
        border-radius: 12px;
        width: 520px;
        max-width: 90vw;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px 0;
    }

    .modal-header h3 {
        font-size: 18px;
        color: #e0e0e0;
    }

    .modal-close {
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
    }

    .modal-close:hover {
        color: #aaa;
        background: #2a2a2a;
    }

    .modal-body {
        padding: 16px 24px;
    }

    .modal-footer {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        padding: 0 24px 20px;
    }
</style>
