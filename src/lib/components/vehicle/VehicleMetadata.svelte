<script lang="ts">
	import { Car, Info } from 'lucide-svelte';

	let { 
        bundle, 
        fingerprint = '',
        carList = null,
        isLoading = false 
    } = $props<{
		bundle: { name: string; [key: string]: any } | null;
        fingerprint?: string;
        carList?: Record<string, any> | null;
        isLoading?: boolean;
	}>();

    // Find matches in CarList if we have a fingerprint but no bundle
    let matchingCars = $derived.by(() => {
        if (bundle || !fingerprint || !carList) return [];
        return Object.entries(carList)
            .filter(([name, data]) => data.platform === fingerprint)
            .map(([name, data]) => ({ name, ...data }));
    });

    let displayData = $derived(bundle || (matchingCars.length > 0 ? matchingCars[0] : null));
</script>

<div class="flex h-full flex-col rounded-xl border border-[#334155] bg-[#1e293b]/50 p-6">
	<div class="mb-6 flex items-center gap-3">
		<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400" class:animate-pulse={isLoading}>
			<Info size={20} />
		</div>
		<h3 class="text-lg font-bold text-white">Vehicle Details</h3>
	</div>

    {#if isLoading}
        <div class="space-y-6 animate-pulse">
            <div>
                <div class="h-3 w-16 rounded bg-slate-700"></div>
                <div class="mt-2 h-6 w-3/4 rounded bg-slate-700"></div>
            </div>
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {#each Array(4) as _}
                <div>
                    <div class="h-3 w-12 rounded bg-slate-700"></div>
                    <div class="mt-2 h-5 w-24 rounded bg-slate-700"></div>
                </div>
                {/each}
            </div>
        </div>
    {:else if displayData}
		<div class="space-y-6">
			<!-- Platform Name (Fingerprint) -->
			<div>
				<div class="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {bundle ? 'Platform' : 'Detected Platform'}
                </div>
				<div class="mt-1 font-mono text-lg font-bold text-white break-all">
                    {bundle ? bundle.name : (fingerprint)}
                </div>
			</div>

            {#if bundle}
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
				<!-- Make -->
				<div>
					<div class="text-xs font-bold uppercase tracking-wider text-slate-500">Make</div>
					<div class="mt-1 text-base font-medium text-white">{bundle.make || 'Unknown'}</div>
				</div>

				<!-- Model -->
				<div>
					<div class="text-xs font-bold uppercase tracking-wider text-slate-500">Model</div>
					<div class="mt-1 text-base font-medium text-white">{bundle.model || 'Unknown'}</div>
				</div>

				<!-- Years -->
				<div>
					<div class="text-xs font-bold uppercase tracking-wider text-slate-500">Years</div>
					<div class="mt-1 text-base font-medium text-white">
						{Array.isArray(bundle.year) ? bundle.year.join(', ') : bundle.year || 'Unknown'}
					</div>
				</div>

                <!-- Package/Trim -->
                {#if bundle.package}
				<div class="sm:col-span-2">
					<div class="text-xs font-bold uppercase tracking-wider text-slate-500">Package / Trim</div>
					<div class="mt-1 text-base font-medium text-white">{bundle.package}</div>
				</div>
                {/if}
			</div>
            {/if}
            
            <!-- Conflicting/Multiple Matches from CarList -->
            {#if !bundle && matchingCars.length > 0}
            <div class="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                 <div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                     Matching Configurations ({matchingCars.length})
                 </div>
                 <div class="max-h-60 overflow-y-auto space-y-1 pr-2">
                     {#each matchingCars as car}
                        <div class="text-xs text-slate-300 py-1 border-b border-slate-700/50 last:border-0">
                            {car.name}
                        </div>
                     {/each}
                 </div>
            </div>
            {/if}

            <!-- JSON Dump -->
             <div class="pt-4 border-t border-slate-700/50">
                 <details class="group">
                     <summary class="cursor-pointer text-xs font-mono text-slate-500 hover:text-slate-300">View Raw Configuration</summary>
                     <pre class="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-400">
{JSON.stringify(bundle || matchingCars, null, 2)}
                     </pre>
                 </details>
             </div>
		</div>
    {:else if fingerprint}
         <!-- Fingerprint exists but not in CarList -->
        <div class="flex flex-1 flex-col items-center justify-center py-10 text-center space-y-4">
			<div class="rounded-full bg-slate-800 p-4">
                <Car size={32} class="text-slate-500" />
            </div>
            <div>
    			<h4 class="font-bold text-white">Unknown Vehicle</h4>
                <p class="text-sm text-slate-400 mt-1">Fingerprint: <code class="bg-slate-800 px-1 py-0.5 rounded">{fingerprint}</code></p>
    			<p class="text-xs text-slate-500 mt-2">This platform is not in the known vehicle list.</p>
            </div>
		</div>
	{:else}
		<div class="flex flex-1 flex-col items-center justify-center py-10 text-center text-slate-500">
			<Car size={48} class="mb-4 opacity-20" />
			<p>Select a vehicle to view its details.</p>
		</div>
	{/if}
</div>
