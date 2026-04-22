<script lang="ts">
	import { Info, Zap } from 'lucide-svelte';
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
				class="btn btn-ghost btn-xs text-amber-700 transition-all duration-100 hover:bg-amber-500/15 active:scale-[0.94] active:bg-amber-500/25 dark:text-amber-300"
				onclick={dismissSession}
			>
				Dismiss
			</button>
		</div>
		<div class="space-y-2 px-4 py-3">
			<div class="flex gap-2.5">
				<Zap
					class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
					size={16}
					aria-hidden="true"
				/>
				<p class="text-[0.8125rem] font-[450] text-amber-800 dark:text-amber-200/90">
					Newer sunnylink features aren't available in this sunnypilot version. Update sunnypilot on
					the device to get them.
				</p>
			</div>
		</div>
		<div class="flex justify-between border-t border-amber-500/25 px-4 py-2.5">
			<button
				type="button"
				class="btn btn-ghost btn-xs text-amber-700 transition-all duration-100 hover:bg-amber-500/15 active:scale-[0.94] active:bg-amber-500/25 dark:text-amber-300"
				onclick={openLearnMore}
			>
				Learn more
			</button>
			<button
				type="button"
				class="btn btn-ghost btn-xs text-amber-700 transition-all duration-100 hover:bg-amber-500/15 active:scale-[0.94] active:bg-amber-500/25 dark:text-amber-300"
				onclick={dismissForever}
			>
				Don't show again
			</button>
		</div>
	</div>
	<LegacyInfoModal bind:open={modalOpen} />
{/if}
