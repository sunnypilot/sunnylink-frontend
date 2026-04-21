<script lang="ts">
	import {
		EllipsisVertical,
		Pencil,
		Copy,
		Check,
		Download,
		Loader2,
		Trash2,
		Calendar
	} from 'lucide-svelte';
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
		class="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-elevated)] focus-visible:text-[var(--sl-text-1)] focus-visible:outline-none active:scale-[0.88] active:bg-[var(--sl-bg-subtle)] {open
			? 'relative z-50'
			: ''}"
		onclick={toggle}
		aria-label="Device actions"
		aria-haspopup="menu"
		aria-expanded={open}
	>
		<EllipsisVertical size={16} />
	</button>

	{#if open}
		<!-- Mobile-only backdrop: captures outside taps so the close does not
		     also trigger the element behind the menu. Desktop uses the
		     svelte:window listener above so clicks can fall through as before. -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-40 md:hidden"
			onclick={(e) => {
				e.stopPropagation();
				close();
			}}
			aria-hidden="true"
		></div>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute top-full right-0 z-50 mt-1 w-56 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-1.5 shadow-lg"
			onclick={(e) => e.stopPropagation()}
			in:fly={{ y: -8, duration: 150, easing: cubicOut }}
			out:fade={{ duration: 100 }}
		>
			{#if onRename}
				<button
					class="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-subtle)] focus-visible:outline-none active:scale-[0.98] active:bg-[var(--sl-bg-elevated)]"
					onclick={(e) => handleAction(e, onRename)}
				>
					<Pencil size={14} />
					Rename
				</button>
				<div class="my-1 border-t border-[var(--sl-border-emphasis)]"></div>
			{/if}

			<div class="px-2.5 pt-1 pb-0.5">
				<span
					class="text-[0.6875rem] font-semibold tracking-wider text-[var(--sl-text-3)] uppercase"
					>Identity</span
				>
			</div>

			<button
				class="group flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] focus-visible:bg-[var(--sl-bg-subtle)] focus-visible:outline-none active:scale-[0.98] active:bg-[var(--sl-bg-elevated)]"
				onclick={(e) => copyToClipboard(e, deviceId, 'sunnylink')}
				aria-label="Copy sunnylink Device ID {deviceId}"
			>
				<span class="min-w-0 flex-1">
					<span class="block text-[0.6875rem] tracking-wide text-[var(--sl-text-3)] uppercase"
						>sunnylink</span
					>
					<span
						class="block truncate font-mono text-[0.8125rem] text-[var(--sl-text-2)] group-hover:text-[var(--sl-text-1)]"
						>{deviceId}</span
					>
				</span>
				<span class="relative flex h-[14px] w-[14px] shrink-0 items-center justify-center">
					{#if copiedField === 'sunnylink'}
						<span in:fly={{ y: 4, duration: 200 }} out:fade={{ duration: 100 }}>
							<Check size={14} class="text-emerald-600 dark:text-emerald-400" />
						</span>
					{:else}
						<Copy size={14} class="text-[var(--sl-text-3)]" />
					{/if}
				</span>
			</button>

			{#if dongleId}
				<button
					class="group flex min-h-[44px] w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--sl-bg-subtle)] focus-visible:bg-[var(--sl-bg-subtle)] focus-visible:outline-none"
					onclick={(e) => copyToClipboard(e, dongleId, 'dongle')}
					aria-label="Copy comma Dongle ID {dongleId}"
				>
					<span class="min-w-0 flex-1">
						<span class="block text-[0.6875rem] tracking-wide text-[var(--sl-text-3)] uppercase"
							>comma dongle</span
						>
						<span
							class="block truncate font-mono text-[0.8125rem] text-[var(--sl-text-2)] group-hover:text-[var(--sl-text-1)]"
							>{dongleId}</span
						>
					</span>
					<span class="relative flex h-[14px] w-[14px] shrink-0 items-center justify-center">
						{#if copiedField === 'dongle'}
							<span in:fly={{ y: 4, duration: 200 }} out:fade={{ duration: 100 }}>
								<Check size={14} class="text-emerald-600 dark:text-emerald-400" />
							</span>
						{:else}
							<Copy size={14} class="text-[var(--sl-text-3)]" />
						{/if}
					</span>
				</button>
			{/if}

			{#if onDownloadBackup}
				<button
					class="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)] focus-visible:bg-[var(--sl-bg-subtle)] focus-visible:outline-none active:scale-[0.98] active:bg-[var(--sl-bg-elevated)] disabled:active:scale-100"
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
				<div class="my-1 border-t border-[var(--sl-border-emphasis)]"></div>
				<div
					class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.75rem] text-[var(--sl-text-3)]"
				>
					<Calendar size={13} />
					Paired {formatPairedDate(pairedAt)}
				</div>
			{/if}

			{#if onDeregister}
				<div class="my-1 border-t border-[var(--sl-border-emphasis)]"></div>
				<button
					class="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] text-red-600 transition-all duration-100 hover:bg-red-500/5 focus-visible:bg-red-500/5 focus-visible:outline-none active:scale-[0.98] active:bg-red-500/10 dark:text-red-400"
					onclick={(e) => handleAction(e, onDeregister)}
				>
					<Trash2 size={14} />
					Deregister Device
				</button>
			{/if}
		</div>
	{/if}
</div>
