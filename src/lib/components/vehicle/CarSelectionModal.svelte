<script lang="ts">
	import { X, Search, ChevronRight, Car } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import { browser } from '$app/environment';

	let {
		open = $bindable(false),
		carList,
		onSelect
	} = $props<{
		open: boolean;
		carList: Record<string, any> | null;
		onSelect: (platform: string, data: any) => void;
	}>();

	let searchQuery = $state('');

	// Parse and group car list
	let groupedCars = $derived.by(() => {
		if (!carList) return [];

		const platforms = Object.keys(carList).sort();
		const groups: Record<string, any[]> = {};

		for (const platform of platforms) {
			const data = carList[platform];
			const make = data.make || 'Unknown';

			// Filter based on search
			if (searchQuery.trim()) {
				const query = searchQuery.toLowerCase();
				const searchTags =
					`${platform} ${make} ${(data.year || []).join(' ')} ${data.model || ''}`.toLowerCase();
				if (!searchTags.includes(query)) continue;
			}

			if (!groups[make]) groups[make] = [];
			groups[make].push({ id: platform, ...data });
		}

		// Sort makes and return array
		return Object.keys(groups)
			.sort()
			.map((make) => ({
				make,
				cars: groups[make] // Cars are already sorted by platform key from earlier loop
			}));
	});

	function handleSelect(car: any) {
		onSelect(car.id, car);
		open = false;
	}

	$effect(() => {
		if (!open) searchQuery = '';
	});

	// Lock body scroll when open
	$effect(() => {
		if (!browser) return;
		if (open) {
			document.body.style.overflow = 'hidden';
			return () => {
				document.body.style.overflow = '';
			};
		}
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 200 }}
	>
		<!-- Modal Content -->
		<div
			class="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-page)] shadow-2xl"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-[var(--sl-border)] p-6">
				<div>
					<h2 class="text-xl font-bold text-[var(--sl-text-1)]">Select a Vehicle</h2>
					<p class="mt-1 text-sm text-[var(--sl-text-2)]">
						Choose your vehicle to force a specific fingerprint.
					</p>
				</div>
				<button
					class="rounded-lg p-2 text-[var(--sl-text-2)] hover:bg-[var(--sl-bg-surface)] hover:text-[var(--sl-text-1)]"
					onclick={() => (open = false)}
				>
					<X size={24} />
				</button>
			</div>

			<!-- Search -->
			<div class="border-b border-[var(--sl-border)] p-4">
				<div class="relative">
					<Search class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-[var(--sl-text-3)]" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search make, model, year (e.g. 'Toyota Corolla 2021')"
						class="w-full rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-input)] py-3 pr-4 pl-10 text-[var(--sl-text-1)] placeholder-[var(--sl-text-3)] focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
						autofocus
					/>
				</div>
			</div>

			<!-- List -->
			<div class="flex-1 overflow-y-auto p-2">
				{#if !carList}
					<div class="flex h-40 items-center justify-center text-[var(--sl-text-3)]">
						<span class="flex items-center gap-2"> Loading vehicle list... </span>
					</div>
				{:else if groupedCars.length === 0}
					<div class="flex h-40 items-center justify-center text-[var(--sl-text-3)]">
						No vehicles found matching "{searchQuery}"
					</div>
				{:else}
					<div class="space-y-4 p-2">
						{#each groupedCars as group (group.make)}
							<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-input)]">
								<div
									class="bg-[var(--sl-bg-elevated)] px-4 py-2 text-xs font-bold tracking-wider text-[var(--sl-text-2)] uppercase"
								>
									{group.make}
								</div>
								<div class="divide-y divide-[var(--sl-border-muted)]">
									{#each group.cars as car (car.id)}
										<button
											class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--sl-bg-surface)]"
											onclick={() => handleSelect(car)}
										>
											<div class="flex items-center gap-3">
												<div
													class="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--sl-bg-surface)] text-[var(--sl-text-2)]"
												>
													<Car size={20} />
												</div>
												<div>
													<div class="font-medium text-[var(--sl-text-1)]">{car.id}</div>
													{#if car.package}
														<div class="text-xs text-[var(--sl-text-3)]">{car.package}</div>
													{/if}
												</div>
											</div>
											<ChevronRight size={16} class="text-[var(--sl-text-3)]" />
										</button>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
