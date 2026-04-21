<script lang="ts">
	import { themeState, type ThemePreference } from '$lib/stores/theme.svelte';
	import { Sun, Moon, Monitor } from 'lucide-svelte';

	interface Props {
		/** 'full' renders icon + label; 'compact' renders icon only. */
		variant?: 'full' | 'compact';
		/** When true, buttons share available width equally (flex-1). */
		fillWidth?: boolean;
	}

	let { variant = 'full', fillWidth = false }: Props = $props();

	const options: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
		{ value: 'light', icon: Sun, label: 'Light' },
		{ value: 'dark', icon: Moon, label: 'Dark' },
		{ value: 'auto', icon: Monitor, label: 'System' }
	];
</script>

<div
	class={['flex rounded-lg bg-[var(--sl-bg-page)] p-1', fillWidth ? 'w-full' : 'inline-flex']}
	role="group"
	aria-label="Theme"
>
	{#each options as opt}
		{@const isActive = themeState.preference === opt.value}
		<button
			type="button"
			class={[
				'flex items-center justify-center rounded-md transition-all duration-150 active:scale-[0.94]',
				'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
				variant === 'full' ? 'gap-1.5 px-3 py-1.5 text-xs' : 'px-2.5 py-1.5',
				fillWidth && 'flex-1',
				isActive
					? 'bg-[var(--sl-accent-muted)] font-medium text-[var(--sl-text-1)] ring-1 ring-primary/40'
					: 'text-[var(--sl-text-3)] hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)]'
			]}
			aria-label="{opt.label} theme"
			aria-pressed={isActive}
			onclick={() => themeState.setPreference(opt.value)}
		>
			<opt.icon size={14} class={isActive ? 'text-primary' : ''} />
			{#if variant === 'full'}
				<span>{opt.label}</span>
			{/if}
		</button>
	{/each}
</div>
