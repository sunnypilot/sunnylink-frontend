<script lang="ts">
	import { Info } from 'lucide-svelte';
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
	const shouldShow = $derived(isLegacy && preferences.showLegacyBanner && !sessionDismissed);

	function openLearnMore() {
		modalOpen = true;
	}

	function dismissSession() {
		sessionDismissed = true;
	}

	function dismissForever() {
		preferences.showLegacyBanner = false;
	}
</script>

{#if shouldShow}
	<div
		role="region"
		aria-label="Legacy sunnylink banner"
		class="rounded-xl border border-amber-500/25 bg-amber-500/5 dark:bg-amber-500/10"
	>
		<div class="flex items-center gap-3 border-b border-amber-500/25 px-4 py-3">
			<div class="rounded-full bg-amber-500/15 p-1.5 text-amber-600 dark:text-amber-400">
				<Info size={16} aria-hidden="true" />
			</div>
			<p class="flex-1 text-sm font-medium text-amber-700 dark:text-amber-300">
				Using legacy sunnylink with this device's sunnypilot version
			</p>
			<button
				type="button"
				class="btn text-amber-700 btn-ghost transition-all duration-100 btn-xs hover:bg-amber-500/15 active:scale-[0.94] active:bg-amber-500/25 dark:text-amber-300"
				onclick={dismissSession}
			>
				Dismiss
			</button>
		</div>
		<div class="px-4 py-3">
			<p class="text-[0.8125rem] font-[450] text-amber-800 dark:text-amber-200/90">
				Update sunnypilot on the device to access newer features.
			</p>
		</div>
		<div class="flex justify-between border-t border-amber-500/25 px-4 py-2.5">
			<button
				type="button"
				class="btn text-amber-700 btn-ghost transition-all duration-100 btn-xs hover:bg-amber-500/15 active:scale-[0.94] active:bg-amber-500/25 dark:text-amber-300"
				onclick={openLearnMore}
			>
				Learn more
			</button>
			<button
				type="button"
				class="btn text-amber-700 btn-ghost transition-all duration-100 btn-xs hover:bg-amber-500/15 active:scale-[0.94] active:bg-amber-500/25 dark:text-amber-300"
				onclick={dismissForever}
			>
				Don't show again
			</button>
		</div>
	</div>
	<LegacyInfoModal bind:open={modalOpen} />
{/if}
