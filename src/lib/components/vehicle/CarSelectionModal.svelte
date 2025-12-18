<script lang="ts">
	import { X, Search, ChevronRight, Car } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
    import { browser } from '$app/environment';

	let { open = $bindable(false), carList, onSelect } = $props<{
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
				const searchTags = `${platform} ${make} ${(data.year || []).join(' ')} ${data.model || ''}`.toLowerCase();
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
		class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 200 }}
	>
		<!-- Modal Content -->
		<div
			class="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-[#0f1726] shadow-2xl"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-slate-800 p-6">
				<div>
					<h2 class="text-xl font-bold text-white">Select a Vehicle</h2>
					<p class="mt-1 text-sm text-slate-400">
						Choose your vehicle to force a specific fingerprint.
					</p>
				</div>
				<button
					class="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
					onclick={() => (open = false)}
				>
					<X size={24} />
				</button>
			</div>

			<!-- Search -->
			<div class="border-b border-slate-800 p-4">
				<div class="relative">
					<Search class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search make, model, year (e.g. 'Toyota Corolla 2021')"
						class="w-full rounded-xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-4 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						autofocus
					/>
				</div>
			</div>

			<!-- List -->
			<div class="flex-1 overflow-y-auto p-2">
				{#if !carList}
					<div class="flex h-40 items-center justify-center text-slate-500">
						<span class="flex items-center gap-2">
							Loading vehicle list...
						</span>
					</div>
				{:else if groupedCars.length === 0}
					<div class="flex h-40 items-center justify-center text-slate-500">
						No vehicles found matching "{searchQuery}"
					</div>
				{:else}
					<div class="space-y-4 p-2">
						{#each groupedCars as group (group.make)}
							<div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
								<div class="bg-slate-800/50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
									{group.make}
								</div>
								<div class="divide-y divide-slate-800">
									{#each group.cars as car (car.id)}
										<button
											class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-800"
											onclick={() => handleSelect(car)}
										>
											<div class="flex items-center gap-3">
												<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
													<Car size={20} />
												</div>
												<div>
													<div class="font-medium text-white">{car.id}</div>
													{#if car.package}
														<div class="text-xs text-slate-500">{car.package}</div>
													{/if}
												</div>
											</div>
											<ChevronRight size={16} class="text-slate-600" />
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
