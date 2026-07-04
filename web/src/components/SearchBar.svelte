<script>
    import { createEventDispatcher } from "svelte";
    import { Search } from "lucide-svelte";

    const dispatch = createEventDispatcher();
    let value = "";
    let timer;

    function handleInput(e) {
        value = e.target.value;
        clearTimeout(timer);
        timer = setTimeout(() => {
            dispatch("search", value);
        }, 300);
    }

    function handleKeyDown(e) {
        if (e.key === "Enter") {
            clearTimeout(timer);
            dispatch("search", value);
        }
    }
</script>

<div class="search-bar">
    <Search size={16} class="search-icon" />
    <input
        type="text"
        placeholder="搜索资源、文件..."
        {value}
        on:input={handleInput}
        on:keydown={handleKeyDown}
    />
</div>

<style>
    .search-bar {
        position: relative;
        display: flex;
        align-items: center;
    }

    .search-icon {
        position: absolute;
        left: 12px;
        color: #666;
    }

    input {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 10px 16px 10px 38px;
        color: #e0e0e0;
        font-size: 13px;
        width: 280px;
        outline: none;
        transition: border-color 0.15s;
    }

    input:focus {
        border-color: #6366f1;
    }

    input::placeholder {
        color: #555;
    }
</style>
