<script lang="ts">
	import { themeState, type ThemePreference } from '$lib/stores/theme.svelte';
	import { Sun, Moon, Monitor } from 'lucide-svelte';

	const options: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
		{ value: 'light', icon: Sun, label: 'Light' },
		{ value: 'dark', icon: Moon, label: 'Dark' },
		{ value: 'auto', icon: Monitor, label: 'System' }
	];
</script>

<div class="flex items-center gap-1 rounded-lg bg-[var(--sl-bg-subtle)] p-1">
	{#each options as opt}
		{@const isActive = themeState.preference === opt.value}
		<button
			type="button"
			class="flex items-center justify-center rounded-md px-2.5 py-1.5 transition-all duration-150"
			class:bg-[var(--sl-bg-surface)]={isActive}
			class:shadow-sm={isActive}
			class:text-[var(--sl-text-1)]={isActive}
			class:text-[var(--sl-text-3)]={!isActive}
			aria-label="{opt.label} theme"
			aria-pressed={isActive}
			onclick={() => themeState.setPreference(opt.value)}
		>
			<opt.icon size={14} />
		</button>
	{/each}
</div>
