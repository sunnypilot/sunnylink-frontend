<script lang="ts">
	import { fade } from 'svelte/transition';

	interface Props {
		/** Show the loading spinner below the wordmark. Off for terminal states
		 *  (session-expired, blocked UX) where "loading" would be misleading. */
		spinner?: boolean;
		/** Accessible label (announced via aria-label). */
		label?: string;
	}

	let { spinner = true, label = 'Loading' }: Props = $props();
</script>

<div
	class="flex h-[100dvh] touch-none flex-col items-center justify-center overflow-hidden bg-[var(--sl-bg-page)] px-6 select-none"
	role="status"
	aria-live="polite"
	aria-label={label}
	in:fade={{ duration: 200 }}
>
	<p
		class="font-audiowide text-[1.5rem] font-semibold tracking-[0.20em] text-[var(--sl-text-1)] uppercase"
	>
		sunnylink
	</p>
	{#if spinner}
		<span
			class="loading mt-6 loading-spinner text-primary"
			style="width: 24px; height: 24px;"
			aria-hidden="true"
		></span>
	{/if}
</div>
