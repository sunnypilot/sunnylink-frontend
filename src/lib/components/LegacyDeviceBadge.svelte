<script lang="ts">
	import { schemaState } from '$lib/stores/schema.svelte';
	import { Info, ChevronRight } from 'lucide-svelte';
	import LegacyInfoModal from '$lib/components/LegacyInfoModal.svelte';

	interface Props {
		deviceId: string | null | undefined;
		variant?: 'dot' | 'chip' | 'banner';
		className?: string;
		onBeforeOpen?: () => void;
	}

	let { deviceId, variant = 'dot', className = '', onBeforeOpen }: Props = $props();

	let isLegacy = $derived(!!deviceId && schemaState.schemaUnavailable[deviceId] === true);
	let modalOpen = $state(false);

	function openModal(e: MouseEvent | KeyboardEvent) {
		e.stopPropagation();
		onBeforeOpen?.();
		modalOpen = true;
	}
</script>

{#if isLegacy}
	{#if variant === 'banner'}
		<button
			type="button"
			onclick={openModal}
			class="flex w-full items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-2.5 text-left text-[0.8125rem] text-amber-700 transition-colors hover:bg-amber-500/15 focus-visible:outline-2 focus-visible:outline-amber-600 dark:bg-amber-500/10 dark:text-amber-300 {className}"
			aria-label="Legacy sunnylink on this device"
		>
			<Info size={16} class="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
			<span class="min-w-0 flex-1 font-medium">Legacy sunnylink</span>
			<ChevronRight size={14} class="shrink-0 opacity-60" aria-hidden="true" />
		</button>
	{:else if variant === 'chip'}
		<button
			type="button"
			onclick={openModal}
			class="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-amber-600 dark:text-amber-300 {className}"
			aria-label="Legacy sunnylink on this device"
		>
			<Info size={10} aria-hidden="true" />
			<span>Legacy</span>
		</button>
	{:else}
		<!-- Dot is visual-only because it lives inside another button (DeviceStatusPill
		     trigger) — nested buttons are invalid HTML. The popover that opens on
		     pill click contains the banner variant, which is interactive. -->
		<span
			class="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500 ring-2 ring-amber-500/30 {className}"
			title="Legacy sunnylink on this device"
			aria-label="Legacy sunnylink on this device"
		>
			<span class="sr-only">Legacy device</span>
		</span>
	{/if}

	<LegacyInfoModal bind:open={modalOpen} />
{/if}
