<script lang="ts">
	import { X, Search, ChevronRight, Car } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { portal } from '$lib/utils/portal';

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
				cars: groups[make]
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

	// Close on Escape key
	$effect(() => {
		if (!browser || !open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-4 sm:items-center sm:p-0"
		transition:fade={{ duration: 200 }}
		onclick={() => (open = false)}
		use:portal
	>
		<!-- Modal Content — stop propagation so clicking inside doesn't close -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex w-full max-w-[480px] flex-col rounded-t-xl border border-[var(--sl-border)] bg-[var(--sl-bg-page)] shadow-2xl sm:rounded-xl"
			style="max-height: min(70vh, 600px);"
			transition:fly={{ y: 20, duration: 300 }}
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-[var(--sl-border)] px-5 py-4">
				<h2 class="text-[15px] font-semibold text-[var(--sl-text-1)]">Select a Vehicle</h2>
				<button
					class="rounded-md p-1 text-[var(--sl-text-3)] hover:bg-[var(--sl-bg-surface)] hover:text-[var(--sl-text-1)]"
					onclick={() => (open = false)}
				>
					<X size={16} />
				</button>
			</div>

			<!-- Search -->
			<div class="border-b border-[var(--sl-border)] px-4 py-3">
				<div class="relative">
					<Search class="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[var(--sl-text-3)]" />
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search vehicles..."
						class="w-full rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-input)] py-2 pr-3 pl-8 text-[13px] text-[var(--sl-text-1)] placeholder-[var(--sl-text-3)] focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
						autofocus
					/>
				</div>
			</div>

			<!-- List -->
			<div class="min-h-0 flex-1 overflow-y-auto p-2">
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
							<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
								<div
									class="px-4 py-2 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase"
								>
									{group.make}
								</div>
								<div class="divide-y divide-[var(--sl-border-muted)]">
									{#each group.cars as car (car.id)}
										<button
											class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-[var(--sl-bg-subtle)]"
											onclick={() => handleSelect(car)}
										>
											<div class="flex items-center gap-3">
												<div
													class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sl-bg-elevated)] text-[var(--sl-text-3)]"
												>
													<Car size={16} />
												</div>
												<div>
													<div class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{car.id}</div>
													{#if car.package}
														<div class="text-[0.6875rem] text-[var(--sl-text-3)]">{car.package}</div>
													{/if}
												</div>
											</div>
											<ChevronRight size={14} class="text-[var(--sl-text-3)]" />
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
