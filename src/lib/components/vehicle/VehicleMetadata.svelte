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
			.filter(([name, data]) => (data as any).platform === fingerprint)
			.map(([name, data]) => ({ name, ...(data as object) }));
	});

	let displayData = $derived(bundle || (matchingCars.length > 0 ? matchingCars[0] : null));
</script>

<div class="flex flex-col rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-6">
	<div class="mb-6 flex items-center gap-3">
		<div
			class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary"
			class:animate-pulse={isLoading}
		>
			<Info size={20} />
		</div>
		<h3 class="text-lg font-bold text-[var(--sl-text-1)]">Vehicle Details</h3>
	</div>

	{#if isLoading}
		<div class="animate-pulse space-y-6">
			<div>
				<div class="h-3 w-16 rounded bg-[var(--sl-bg-elevated)]"></div>
				<div class="mt-2 h-6 w-3/4 rounded bg-[var(--sl-bg-elevated)]"></div>
			</div>
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
				{#each Array(4) as _}
					<div>
						<div class="h-3 w-12 rounded bg-[var(--sl-bg-elevated)]"></div>
						<div class="mt-2 h-5 w-24 rounded bg-[var(--sl-bg-elevated)]"></div>
					</div>
				{/each}
			</div>
		</div>
	{:else if displayData}
		<div class="space-y-6">
			<!-- Platform Name (Fingerprint) -->
			<div>
				<div class="text-xs font-bold tracking-wider text-[var(--sl-text-3)] uppercase">
					{bundle ? 'Platform' : 'Detected Platform'}
				</div>
				<div class="mt-1 font-mono text-lg font-bold break-all text-[var(--sl-text-1)]">
					{bundle ? bundle.name : fingerprint}
				</div>
			</div>

			{#if bundle}
				<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
					<!-- Make -->
					<div>
						<div class="text-xs font-bold tracking-wider text-[var(--sl-text-3)] uppercase">Make</div>
						<div class="mt-1 text-base font-medium text-[var(--sl-text-1)]">{bundle.make || 'Unknown'}</div>
					</div>

					<!-- Model -->
					<div>
						<div class="text-xs font-bold tracking-wider text-[var(--sl-text-3)] uppercase">Model</div>
						<div class="mt-1 text-base font-medium text-[var(--sl-text-1)]">{bundle.model || 'Unknown'}</div>
					</div>

					<!-- Years -->
					<div>
						<div class="text-xs font-bold tracking-wider text-[var(--sl-text-3)] uppercase">Years</div>
						<div class="mt-1 text-base font-medium text-[var(--sl-text-1)]">
							{Array.isArray(bundle.year) ? bundle.year.join(', ') : bundle.year || 'Unknown'}
						</div>
					</div>

					<!-- Package/Trim -->
					{#if bundle.package}
						<div class="sm:col-span-2">
							<div class="text-xs font-bold tracking-wider text-[var(--sl-text-3)] uppercase">
								Package / Trim
							</div>
							<div class="mt-1 text-base font-medium text-[var(--sl-text-1)]">{bundle.package}</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Conflicting/Multiple Matches from CarList -->
			{#if !bundle && matchingCars.length > 0}
				<div class="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3">
					<div class="mb-2 text-xs font-bold tracking-wider text-[var(--sl-text-2)] uppercase">
						Matching Configurations ({matchingCars.length})
					</div>
					<div class="space-y-1">
						{#each matchingCars as car}
							<div class="border-b border-[var(--sl-border-muted)] py-1 text-xs text-[var(--sl-text-2)] last:border-0">
								{car.name}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- JSON Dump -->
			<div class="border-t border-[var(--sl-border-muted)] pt-4">
				<details class="group">
					<summary class="cursor-pointer font-mono text-xs text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]"
						>View Raw Configuration</summary
					>
					<pre class="mt-2 overflow-x-auto rounded-lg bg-[var(--sl-bg-input)] p-3 text-xs text-[var(--sl-text-2)]">
{JSON.stringify(bundle || matchingCars, null, 2)}
                     </pre>
				</details>
			</div>
		</div>
	{:else if fingerprint}
		<!-- Fingerprint exists but not in CarList -->
		<div class="flex flex-1 flex-col items-center justify-center space-y-4 py-10 text-center">
			<div class="rounded-full bg-[var(--sl-bg-surface)] p-4">
				<Car size={32} class="text-[var(--sl-text-3)]" />
			</div>
			<div>
				<h4 class="font-bold text-[var(--sl-text-1)]">Unknown Vehicle</h4>
				<p class="mt-1 text-sm text-[var(--sl-text-2)]">
					Fingerprint: <code class="rounded bg-[var(--sl-bg-surface)] px-1 py-0.5">{fingerprint}</code>
				</p>
				<p class="mt-2 text-xs text-[var(--sl-text-3)]">This platform is not in the known vehicle list.</p>
			</div>
		</div>
	{:else}
		<div class="flex flex-1 flex-col items-center justify-center py-10 text-center text-[var(--sl-text-3)]">
			<Car size={48} class="mb-4 opacity-20" />
			<p>Select a vehicle to view its details.</p>
		</div>
	{/if}
</div>
