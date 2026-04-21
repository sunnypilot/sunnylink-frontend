<script lang="ts">
	import { schemaState } from '$lib/stores/schema.svelte';
	import { AlertTriangle, ChevronRight } from 'lucide-svelte';

	interface Props {
		deviceId: string | null | undefined;
		variant?: 'dot' | 'chip' | 'banner';
		className?: string;
	}

	let { deviceId, variant = 'dot', className = '' }: Props = $props();

	let isLegacy = $derived(!!deviceId && schemaState.schemaUnavailable[deviceId] === true);
</script>

{#if isLegacy}
	{#if variant === 'banner'}
		<a
			href="/dashboard/whats-new"
			class="flex w-full items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-2.5 text-[0.8125rem] text-amber-700 transition-colors hover:bg-amber-500/15 focus-visible:outline-2 focus-visible:outline-amber-600 dark:bg-amber-500/10 dark:text-amber-300 {className}"
			aria-label="sunnypilot on this device is on a legacy version — learn more"
		>
			<AlertTriangle
				size={16}
				class="shrink-0 text-amber-600 dark:text-amber-400"
				aria-hidden="true"
			/>
			<div class="min-w-0 flex-1">
				<p class="font-medium">sunnypilot on this device is on a legacy version</p>
				<p class="text-[0.75rem] text-amber-700/70 dark:text-amber-300/70">
					Update sunnypilot to enjoy the latest sunnylink behaviors
				</p>
			</div>
			<ChevronRight size={14} class="shrink-0 opacity-60" aria-hidden="true" />
		</a>
	{:else if variant === 'chip'}
		<a
			href="/dashboard/whats-new"
			onclick={(e) => e.stopPropagation()}
			class="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[0.6875rem] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-amber-600 dark:text-amber-300 {className}"
			aria-label="sunnypilot on this device is on a legacy version — learn more"
			title="sunnypilot on this device is on a legacy version"
		>
			<AlertTriangle size={10} aria-hidden="true" />
			<span>Legacy</span>
		</a>
	{:else}
		<span
			class="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500 ring-2 ring-amber-500/30 {className}"
			title="sunnypilot on this device is on a legacy version"
			aria-label="sunnypilot on this device is on a legacy version"
		>
			<span class="sr-only">Legacy device</span>
		</span>
	{/if}
{/if}
