<script lang="ts">
	import { Car, ChevronRight, X } from 'lucide-svelte';

	let { 
        manualBundle = null, 
        autoFingerprint = '', 
        onClick 
    } = $props<{
		manualBundle: { name: string, [key: string]: any } | null;
		autoFingerprint: string;
		onClick: () => void;
	}>();

	// Derived state for display
    // Green: Fingerprinted automatically (Auto) -> No manual bundle, but auto fingerprint exists
    // Blue: Manually selected fingerprint (Manual) -> Manual bundle exists
    // Yellow: None -> No manual bundle, no auto fingerprint (or "MOCK" maybe?)
    
    // We'll normalize "MOCK" or empty string as "none"
    
    let isMock = $derived(autoFingerprint === 'MOCK' || !autoFingerprint);
    
    let mode = $derived.by(() => {
        if (manualBundle) return 'manual';
        if (!isMock) return 'auto';
        return 'none';
    });

    let label = $derived.by(() => {
        if (manualBundle) return manualBundle.name;
        if (!isMock) return autoFingerprint;
        return 'No vehicle selected';
    });
    
    let statusText = $derived.by(() => {
        if (manualBundle) return 'Manually selected';
        if (!isMock) return 'Fingerprinted automatically';
        return 'Unrecognized Vehicle';
    });

</script>

<button
	class="group relative flex w-full flex-col overflow-hidden rounded-xl border border-[#334155] bg-[#1e293b] text-left transition-all hover:border-slate-500 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 sm:flex-row sm:items-stretch"
    onclick={(e) => {
        // Prevent click if clicking the remove button inner part? 
        // No, the whole thing is the button unless we separate them.
        // Actually, if it's one big button, clicking anywhere toggles/opens.
        // But for "REMOVE", we might want it to be the actionable part if the whole card is clickable.
        // The current logic is: onClick handles both based on state.
        onClick();
    }}
>
    <!-- Color Strip -->
    <div 
        class="absolute inset-x-0 top-0 h-1 transition-colors duration-300 sm:inset-y-0 sm:left-0 sm:h-auto sm:w-2"
        class:bg-emerald-500={mode === 'auto'}
        class:bg-blue-500={mode === 'manual'}
        class:bg-yellow-500={mode === 'none'}
    ></div>

    <div class="flex flex-1 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:py-6 sm:pl-8 sm:pr-6">
        <div 
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-800 transition-colors"
            class:text-emerald-400={mode === 'auto'}
            class:text-blue-400={mode === 'manual'}
            class:text-yellow-400={mode === 'none'}
        >
            <Car size={24} />
        </div>

        <div class="flex-1 min-w-0">
            <div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                {statusText}
            </div>
            <div class="text-lg font-bold text-white break-words">
                {label}
            </div>
        </div>

        <div class="mt-2 flex shrink-0 sm:mt-0">
            {#if mode === 'manual'}
                <div class="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-bold text-red-400 transition-colors group-hover:bg-red-500/20 group-hover:text-red-300">
                    <X size={16} />
                    <span>REMOVE</span>
                </div>
            {:else}
                <div class="flex items-center gap-2 rounded-lg bg-slate-700/50 px-4 py-2 text-sm font-bold text-slate-300 transition-colors group-hover:bg-slate-700">
                    <span>SELECT</span>
                    <ChevronRight size={16} />
                </div>
            {/if}
        </div>
    </div>
</button>
