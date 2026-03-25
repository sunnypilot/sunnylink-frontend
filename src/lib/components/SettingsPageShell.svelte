<script lang="ts">
	import SyncStatusIndicator from '$lib/components/SyncStatusIndicator.svelte';
	import type { SyncStatus } from '$lib/utils/syncStatus.svelte';

	interface Props {
		title: string;
		description?: string;
		syncStatus?: SyncStatus;
		onRefresh?: () => void;
		loading?: boolean;
		children: import('svelte').Snippet;
	}

	let {
		title,
		description,
		syncStatus,
		onRefresh,
		loading = false,
		children
	}: Props = $props();
</script>

<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
	<!-- Page title block -->
	<div class="px-4">
		<h2 class="flex items-baseline gap-3 text-[24px] font-medium leading-[32px] tracking-[-0.16px] text-[var(--sl-text-1)]">
			<span>{title}</span>
			{#if loading}
				<span class="loading loading-spinner loading-xs text-primary" style="align-self: center;"></span>
			{:else if syncStatus}
				<SyncStatusIndicator status={syncStatus} {onRefresh} />
			{/if}
		</h2>
		{#if description}
			<p class="mt-2 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">{description}</p>
		{/if}
	</div>

	<!-- Content: 36px gap from title block to first content -->
	<div class="mt-9">
		{@render children()}
	</div>
</div>
