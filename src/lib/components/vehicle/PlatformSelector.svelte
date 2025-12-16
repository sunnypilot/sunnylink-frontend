<script lang="ts">
	import { Car, ChevronRight, X, Loader2 } from 'lucide-svelte';

	let { 
        manualBundle = null, 
        autoFingerprint = '', 
        isLoading = false,
        onSelect,
        onRemove
    } = $props<{
		manualBundle: { name: string, [key: string]: any } | null;
		autoFingerprint: string;
        isLoading?: boolean;
		onSelect: () => void;
        onRemove: () => void;
	}>();

	// Derived state for display    
    let isMock = $derived(autoFingerprint === 'MOCK' || !autoFingerprint);
    
    let mode = $derived.by(() => {
        if (manualBundle) return 'manual';
        if (!isMock) return 'auto';
        return 'none';
    });

    let label = $derived.by(() => {
        if (isLoading) return 'Loading vehicle status...';
        if (manualBundle) return manualBundle.name;
        if (!isMock) return autoFingerprint;
        return 'No vehicle selected';
    });
    
    let statusText = $derived.by(() => {
        if (isLoading) return 'Checking Status';
        if (manualBundle) return 'Manually selected';
        if (!isMock) return 'Fingerprinted automatically';
        return 'Unrecognized Vehicle';
    });

</script>

<!-- Container: Button if NOT manual, Div if manual -->
<svelte:element 
    this={mode === 'manual' ? 'div' : 'button'}
	class="group relative flex w-full flex-col overflow-hidden rounded-xl border border-[#334155] bg-[#1e293b] text-left transition-all sm:flex-row sm:items-stretch"
    class:hover:border-slate-500={mode !== 'manual'}
    class:hover:shadow-lg={mode !== 'manual'}
    class:cursor-default={mode === 'manual'}
    class:cursor-pointer={mode !== 'manual'}
    onclick={() => {
        if (mode !== 'manual' && !isLoading) onSelect();
    }}
    disabled={isLoading}
>
    <!-- Color Strip -->
    {#if !isLoading}
    <div 
        class="absolute inset-x-0 top-0 h-1 transition-colors duration-300 sm:inset-y-0 sm:left-0 sm:h-auto sm:w-2"
        class:bg-emerald-500={mode === 'auto'}
        class:bg-blue-500={mode === 'manual'}
        class:bg-yellow-500={mode === 'none'}
    ></div>
    {/if}

    <div class="flex flex-1 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:py-6 sm:pl-8 sm:pr-6">
        <div 
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-800 transition-colors"
            class:text-emerald-400={mode === 'auto'}
            class:text-blue-400={mode === 'manual'}
            class:text-yellow-400={mode === 'none'}
            class:animate-pulse={isLoading}
        >
            {#if isLoading}
                <Loader2 size={24} class="animate-spin text-slate-400" />
            {:else}
                <Car size={24} />
            {/if}
        </div>

        <div class="flex-1 min-w-0">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                {statusText}
            </div>
            <div class="text-lg font-bold text-white break-words">
                {label}
            </div>
        </div>

        <!-- Action Area -->
        <div class="mt-2 flex shrink-0 sm:mt-0">
            {#if !isLoading}
                {#if mode === 'manual'}
                    <button 
                        class="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300 cursor-pointer"
                        onclick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                    >
                        <X size={16} />
                        <span>REMOVE</span>
                    </button>
                {:else}
                    <div class="flex items-center gap-2 rounded-lg bg-slate-700/50 px-4 py-2 text-sm font-bold text-slate-300 transition-colors group-hover:bg-slate-700">
                        <span>SELECT</span>
                        <ChevronRight size={16} />
                    </div>
                {/if}
            {/if}
        </div>
    </div>
</svelte:element>
