<script lang="ts">
	import { Info, X } from 'lucide-svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import LegacyInfoModal from './LegacyInfoModal.svelte';

	interface Props {
		deviceId: string | null | undefined;
	}

	let { deviceId }: Props = $props();

	let sessionDismissed = $state(false);
	let modalOpen = $state(false);

	const isLegacy = $derived(!!deviceId && schemaState.schemaUnavailable[deviceId] === true);
	const shouldShow = $derived(
		isLegacy && preferences.showLegacyBanner && !sessionDismissed
	);

	function openLearnMore(e: MouseEvent) {
		e.stopPropagation();
		modalOpen = true;
	}

	function dismissSession(e: MouseEvent) {
		e.stopPropagation();
		sessionDismissed = true;
	}

	function dismissForever(e: MouseEvent) {
		e.stopPropagation();
		preferences.showLegacyBanner = false;
	}
</script>

{#if shouldShow}
	<div
		role="region"
		aria-label="Legacy sunnylink banner"
		class="flex w-full items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-2.5 text-[0.8125rem] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
	>
		<Info size={16} class="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
		<div class="min-w-0 flex-1">
			<span class="font-medium">Legacy sunnylink on this device.</span>
			<button
				type="button"
				onclick={openLearnMore}
				class="ml-1 underline underline-offset-2 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-amber-600"
			>
				Learn more
			</button>
		</div>
		<button
			type="button"
			onclick={dismissForever}
			class="shrink-0 text-[0.75rem] underline underline-offset-2 opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-amber-600"
		>
			Don't show again
		</button>
		<button
			type="button"
			onclick={dismissSession}
			aria-label="Dismiss"
			class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-amber-500/15 focus-visible:outline-2 focus-visible:outline-amber-600 active:scale-[0.92]"
		>
			<X size={14} aria-hidden="true" />
		</button>
	</div>
	<LegacyInfoModal bind:open={modalOpen} />
{/if}
