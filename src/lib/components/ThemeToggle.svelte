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
	class={[
		'flex gap-0.5 rounded-lg bg-[var(--sl-bg-page)] p-1',
		fillWidth ? 'w-full' : 'inline-flex'
	]}
	role="group"
	aria-label="Theme"
>
	{#each options as opt}
		{@const isActive = themeState.preference === opt.value}
		<button
			type="button"
			class={[
				// Equal width slot, consistent height, center kerning.
				'relative flex items-center justify-center gap-1.5 rounded-md',
				'min-h-[2.75rem] sm:min-h-[2.25rem]',
				variant === 'full' ? 'px-2.5 text-xs' : 'px-2',
				fillWidth && 'flex-1',
				// Motion + press feedback (ui-ux-pro-max: scale-feedback, motion-consistency).
				'transition-all duration-150 active:scale-[0.97]',
				// Focus ring outside the box (outline-offset-2) so active-state bg
				// isn't visually shrunk by focus (ui-ux-pro-max: focus-states).
				'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary focus-visible:outline-solid',
				// Active state matches the sidebar nav-active language
				// (bg-accent-muted + primary accent) so segmented selection
				// reads consistently with the rest of the app — rather than
				// inventing a second "active" style via surface + shadow.
				isActive
					? 'bg-[var(--sl-bg-surface)] font-medium text-primary shadow-sm'
					: 'text-[var(--sl-text-3)] hover:bg-[var(--sl-bg-elevated)]/60 hover:text-[var(--sl-text-2)]'
			]}
			aria-label="{opt.label} theme"
			aria-pressed={isActive}
			onclick={() => themeState.setPreference(opt.value)}
		>
			<opt.icon
				size={14}
				class={isActive ? 'text-primary' : 'text-[var(--sl-text-3)]'}
				aria-hidden="true"
			/>
			{#if variant === 'full'}
				<span>{opt.label}</span>
			{/if}
		</button>
	{/each}
</div>
