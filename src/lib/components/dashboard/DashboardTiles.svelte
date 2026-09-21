<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { getDashboardNavItems } from '$lib/utils/schemaNav';

	let deviceId = $derived(deviceState.selectedDeviceId);
	let tiles = $derived(
		deviceId ? getDashboardNavItems(schemaState.schemas[deviceId]) : getDashboardNavItems(undefined)
	);
</script>

<nav aria-label="Device features">
	<ul class="grid list-none grid-cols-3 gap-3 p-0">
		{#each tiles as tile}
			{@const Icon = tile.icon}
			<li>
				<a
					href={tile.href}
					class="group flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-2 py-3 text-center transition-all duration-100 hover:border-[var(--sl-text-3)]/40 hover:bg-[var(--sl-bg-elevated)] focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.97] active:bg-[var(--sl-bg-subtle)] sm:gap-2.5"
				>
					<Icon
						size={26}
						class="text-[var(--sl-text-2)] transition-colors group-hover:text-[var(--sl-text-1)]"
						aria-hidden="true"
					/>
					<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
						{tile.label}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
