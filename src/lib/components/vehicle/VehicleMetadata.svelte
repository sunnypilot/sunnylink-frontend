<script lang="ts">
	import { Car, Info } from 'lucide-svelte';

	let { bundle } = $props<{
		bundle: { name: string; [key: string]: any } | null;
	}>();
</script>

<div class="h-full rounded-xl border border-[#334155] bg-[#1e293b]/50 p-6">
	<div class="mb-6 flex items-center gap-3">
		<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
			<Info size={20} />
		</div>
		<h3 class="text-lg font-bold text-white">Vehicle Details</h3>
	</div>

	{#if bundle}
		<div class="space-y-6">
			<!-- Platform Name -->
			<div>
				<div class="text-xs font-bold uppercase tracking-wider text-slate-500">Platform</div>
				<div class="mt-1 font-mono text-lg font-bold text-white break-all">{bundle.name}</div>
			</div>

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

            <!-- JSON Dump (Collapsible or just visible for tech details) -->
             <div class="pt-4 border-t border-slate-700/50">
                 <details class="group">
                     <summary class="cursor-pointer text-xs font-mono text-slate-500 hover:text-slate-300">View Raw Configuration</summary>
                     <pre class="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-400">
{JSON.stringify(bundle, null, 2)}
                     </pre>
                 </details>
             </div>
		</div>
	{:else}
		<div class="flex h-full flex-col items-center justify-center py-10 text-center text-slate-500">
			<Car size={48} class="mb-4 opacity-20" />
			<p>Select a vehicle to view its details.</p>
		</div>
	{/if}
</div>
