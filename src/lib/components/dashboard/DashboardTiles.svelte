<script lang="ts">
	import {
		HardDrive,
		ToggleLeft,
		Bot,
		Gauge,
		Wind,
		Palette,
		Map as MapIcon,
		Car,
		Wrench
	} from 'lucide-svelte';

	type Tile = { label: string; icon: typeof HardDrive; href: string };

	const TILES: Tile[] = [
		{ label: 'Device', icon: HardDrive, href: '/dashboard/settings/device' },
		{ label: 'Toggles', icon: ToggleLeft, href: '/dashboard/settings/toggles' },
		{ label: 'Models', icon: Bot, href: '/dashboard/models' },
		{ label: 'Steering', icon: Gauge, href: '/dashboard/settings/steering' },
		{ label: 'Cruise', icon: Wind, href: '/dashboard/settings/cruise' },
		{ label: 'Visuals', icon: Palette, href: '/dashboard/settings/visuals' },
		{ label: 'Maps', icon: MapIcon, href: '/dashboard/osm' },
		{ label: 'Vehicle', icon: Car, href: '/dashboard/settings/vehicle' },
		{ label: 'Developer', icon: Wrench, href: '/dashboard/settings/developer' }
	];
</script>

<nav aria-label="Device features">
	<ul class="grid list-none grid-cols-3 gap-3 p-0">
		{#each TILES as tile}
			{@const Icon = tile.icon}
			<li>
				<a
					href={tile.href}
					class="group flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-2 py-3 text-center transition-colors hover:border-[var(--sl-text-3)]/40 hover:bg-[var(--sl-bg-elevated)] focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary sm:gap-2.5"
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
