<script lang="ts">
	import { EllipsisVertical, Pencil, Copy, Check, Download, Loader2, Trash2, Calendar } from 'lucide-svelte';
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		deviceId: string;
		dongleId?: string;
		pairedAt?: number | string;
		isDownloading?: boolean;
		onRename?: () => void;
		onDownloadBackup?: () => void;
		onDeregister?: () => void;
	}

	let {
		deviceId,
		dongleId,
		pairedAt,
		isDownloading = false,
		onRename,
		onDownloadBackup,
		onDeregister
	}: Props = $props();

	function formatPairedDate(timestamp: number | string): string {
		// created_at is a Unix timestamp in seconds
		const ms = typeof timestamp === 'number' ? timestamp * 1000 : Number(timestamp) * 1000;
		const d = new Date(ms);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	let open = $state(false);
	let copiedField = $state<string | null>(null);

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		open = !open;
	}

	function close() {
		open = false;
	}

	function copyToClipboard(e: MouseEvent, text: string, field: string) {
		e.stopPropagation();
		navigator.clipboard.writeText(text);
		copiedField = field;
		setTimeout(() => {
			copiedField = null;
		}, 2000);
	}

	function handleAction(e: MouseEvent, action: (() => void) | undefined) {
		e.stopPropagation();
		close();
		action?.();
	}
</script>

<svelte:window onclick={close} />

<div class="relative">
	<button
		class="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)]"
		onclick={toggle}
		aria-label="Device actions"
	>
		<EllipsisVertical size={16} />
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] py-1 shadow-lg"
			onclick={(e) => e.stopPropagation()}
			in:fly={{ y: -8, duration: 150, easing: cubicOut }}
			out:fade={{ duration: 100 }}
		>
			{#if onRename}
				<button
					class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
					onclick={(e) => handleAction(e, onRename)}
				>
					<Pencil size={14} />
					Rename
				</button>
			{/if}

			<button
				class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
				onclick={(e) => copyToClipboard(e, deviceId, 'sunnylink')}
			>
				<span class="relative flex h-[14px] w-[14px] items-center justify-center">
					{#if copiedField === 'sunnylink'}
						<span in:fly={{ y: 4, duration: 200 }} out:fade={{ duration: 100 }}>
							<Check size={14} class="text-emerald-600 dark:text-emerald-400" />
						</span>
					{:else}
						<Copy size={14} />
					{/if}
				</span>
				{#if copiedField === 'sunnylink'}
					<span class="text-emerald-600 dark:text-emerald-400">Copied!</span>
				{:else}
					Copy sunnylink Device ID
				{/if}
			</button>

			{#if dongleId}
				<button
					class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
					onclick={(e) => copyToClipboard(e, dongleId, 'dongle')}
				>
					<span class="relative flex h-[14px] w-[14px] items-center justify-center">
						{#if copiedField === 'dongle'}
							<span in:fly={{ y: 4, duration: 200 }} out:fade={{ duration: 100 }}>
								<Check size={14} class="text-emerald-600 dark:text-emerald-400" />
							</span>
						{:else}
							<Copy size={14} />
						{/if}
					</span>
					{#if copiedField === 'dongle'}
						<span class="text-emerald-600 dark:text-emerald-400">Copied!</span>
					{:else}
						Copy comma Dongle ID
					{/if}
				</button>
			{/if}

			{#if onDownloadBackup}
				<button
					class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
					onclick={(e) => handleAction(e, onDownloadBackup)}
					disabled={isDownloading}
				>
					{#if isDownloading}
						<Loader2 size={14} class="animate-spin" />
					{:else}
						<Download size={14} />
					{/if}
					Download Backup
				</button>
			{/if}

			{#if pairedAt}
				<div class="mx-2 my-1 border-t border-[var(--sl-border-emphasis)]"></div>
				<div class="flex items-center gap-2.5 px-3 py-2 text-[0.75rem] text-[var(--sl-text-3)]">
					<Calendar size={13} />
					Paired {formatPairedDate(pairedAt)}
				</div>
			{/if}

			{#if onDeregister}
				<div class="mx-2 my-1 border-t border-[var(--sl-border-emphasis)]"></div>
				<button
					class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] text-red-600 dark:text-red-400 transition-colors hover:bg-red-500/5"
					onclick={(e) => handleAction(e, onDeregister)}
				>
					<Trash2 size={14} />
					Deregister Device
				</button>
			{/if}
		</div>
	{/if}
</div>
