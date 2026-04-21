<script lang="ts">
	import HardDriveBrand from '$lib/components/icons/HardDriveBrand.svelte';
	import ToggleLeftBrand from '$lib/components/icons/ToggleLeftBrand.svelte';
	import BotBrand from '$lib/components/icons/BotBrand.svelte';
	import GaugeBrand from '$lib/components/icons/GaugeBrand.svelte';
	import WindBrand from '$lib/components/icons/WindBrand.svelte';
	import PaletteBrand from '$lib/components/icons/PaletteBrand.svelte';
	import MapBrand from '$lib/components/icons/MapBrand.svelte';
	import CarBrand from '$lib/components/icons/CarBrand.svelte';
	import WrenchBrand from '$lib/components/icons/WrenchBrand.svelte';
	import type { Component } from 'svelte';

	type Tile = {
		label: string;
		icon: Component<{ size?: number | string; class?: string }>;
		href: string;
	};

	const TILES: Tile[] = [
		{ label: 'Device', icon: HardDriveBrand, href: '/dashboard/settings/device' },
		{ label: 'Toggles', icon: ToggleLeftBrand, href: '/dashboard/settings/toggles' },
		{ label: 'Models', icon: BotBrand, href: '/dashboard/models' },
		{ label: 'Steering', icon: GaugeBrand, href: '/dashboard/settings/steering' },
		{ label: 'Cruise', icon: WindBrand, href: '/dashboard/settings/cruise' },
		{ label: 'Visuals', icon: PaletteBrand, href: '/dashboard/settings/visuals' },
		{ label: 'Maps', icon: MapBrand, href: '/dashboard/osm' },
		{ label: 'Vehicle', icon: CarBrand, href: '/dashboard/settings/vehicle' },
		{ label: 'Developer', icon: WrenchBrand, href: '/dashboard/settings/developer' }
	];
</script>

<nav aria-label="Device features">
	<ul class="grid list-none grid-cols-3 gap-3 p-0">
		{#each TILES as tile}
			{@const Icon = tile.icon}
			<li>
				<a
					href={tile.href}
					class="group flex aspect-square flex-col items-center justify-center gap-2.5 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-2 py-3 text-center transition-colors hover:border-[var(--sl-text-3)]/40 hover:bg-[var(--sl-bg-elevated)] focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary sm:gap-3"
				>
					<Icon
						size={48}
						class="text-[var(--sl-text-2)] transition-colors group-hover:text-[var(--sl-text-1)]"
					/>
					<span class="text-sm font-medium text-[var(--sl-text-1)]">
						{tile.label}
					</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
