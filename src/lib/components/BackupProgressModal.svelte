<script lang="ts">
	import {
		Loader2,
		X,
		Minimize2,
		Square,
		Download,
		RefreshCw,
		AlertTriangle,
		Info
	} from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';
	import { deviceState } from '$lib/stores/device.svelte';
	import { downloadSettingsBackup } from '$lib/utils/settings';

	let {
		open = $bindable(false),
		onRetry,
		onFullBackup
	}: { open?: boolean; onRetry?: () => void; onFullBackup?: () => void } = $props();

	let showConfirmStop = $state(false);
	let showFailedDetails = $state(false);

	function handleClose() {
		deviceState.closeBackupModal();
	}

	function handleStop() {
		showConfirmStop = true;
	}

	function confirmStop() {
		deviceState.cancelBackup();
		showConfirmStop = false;
	}

	function cancelStop() {
		showConfirmStop = false;
	}

	function handleDownloadPartial() {
		const bs = deviceState.backupState;
		if (bs.fetchedSettings && bs.deviceId) {
			downloadSettingsBackup(bs.deviceId, bs.fetchedSettings, bs.failedKeys);
			deviceState.closeBackupModal();
		}
	}

	function handleRetryFailed() {
		onRetry?.();
	}

	function handleFullBackup() {
		onFullBackup?.();
	}

	const hasFailedKeys = $derived(
		deviceState.backupState.failedKeys.length > 0 && !deviceState.backupState.isDownloading
	);

	const hasNoValueKeys = $derived(
		deviceState.backupState.failedKeys.some((f) => f.reason === 'no_value_returned')
	);

	const reasonLabels: Record<string, string> = {
		timeout: 'Timeout',
		expired: 'Expired',
		not_found: 'Not Found',
		network_error: 'Network Error',
		no_items_returned: 'No Data',
		no_value_returned: 'No Value',
		error: 'Error',
		unknown: 'Unknown'
	};

	function formatReason(reason: string): string {
		return reasonLabels[reason] ?? reason;
	}
</script>

{#if deviceState.backupState.isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 200 }}
	>
		<div
			class="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-2xl"
			transition:scale={{ duration: 200, start: 0.95 }}
		>
			<div class="border-b border-[var(--sl-border)] bg-[var(--sl-bg-input)]/50 p-4">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-semibold text-[var(--sl-text-1)]">
						{#if hasFailedKeys}
							Partial Backup
						{:else if deviceState.backupState.isDownloading}
							Downloading Backup
						{:else}
							Backup Status
						{/if}
					</h3>
					<div class="flex items-center gap-1">
						{#if deviceState.backupState.isDownloading && !showConfirmStop}
							<button
								onclick={handleClose}
								class="rounded-lg p-1 text-[var(--sl-text-2)] transition-colors hover:bg-white/5 hover:text-[var(--sl-text-1)]"
								title="Minimize to background"
							>
								<Minimize2 size={20} />
							</button>
						{:else if !deviceState.backupState.isDownloading}
							<button
								onclick={handleClose}
								class="rounded-lg p-1 text-[var(--sl-text-2)] transition-colors hover:bg-white/5 hover:text-[var(--sl-text-1)]"
								title="Close"
							>
								<X size={20} />
							</button>
						{/if}
					</div>
				</div>
			</div>

			<div class="p-6">
				{#if showConfirmStop}
					<div class="flex flex-col items-center text-center" transition:fade={{ duration: 150 }}>
						<p class="mb-6 text-[var(--sl-text-2)]">
							Are you sure you want to stop the backup? Progress will be lost.
						</p>
						<div class="flex gap-4">
							<button
								class="rounded-lg bg-[var(--sl-bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--sl-text-1)] transition-colors hover:bg-slate-600"
								onclick={cancelStop}
							>
								Cancel
							</button>
							<button
								class="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-[var(--sl-text-1)] transition-colors hover:bg-red-600"
								onclick={confirmStop}
							>
								Stop Backup
							</button>
						</div>
					</div>
				{:else if hasFailedKeys}
					<div class="flex flex-col gap-4" transition:fade={{ duration: 150 }}>
						<div
							class="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3"
						>
							<AlertTriangle size={20} class="mt-0.5 shrink-0 text-amber-500" />
							<div class="text-sm text-[var(--sl-text-2)]">
								<p class="font-medium text-amber-400">
									{deviceState.backupState.failedKeys.length} settings could not be fetched
								</p>
								<p class="mt-1">You can retry the failed settings or download a partial backup.</p>
							</div>
						</div>

						{#if hasNoValueKeys}
							<div
								class="flex items-start gap-2 rounded-lg border border-blue-500/10 bg-blue-500/5 p-2.5"
							>
								<Info size={16} class="mt-0.5 shrink-0 text-blue-400" />
								<p class="text-xs text-[var(--sl-text-2)]">
									Keys marked "No Value" typically mean the device is using default values and no
									custom setting has been saved. These are safe to skip.
								</p>
							</div>
						{/if}

						<button
							class="text-left text-xs text-[var(--sl-text-2)] hover:text-[var(--sl-text-2)]"
							aria-expanded={showFailedDetails}
							onclick={() => (showFailedDetails = !showFailedDetails)}
						>
							{showFailedDetails ? 'Hide' : 'Show'} failed keys ({deviceState.backupState.failedKeys
								.length})
						</button>

						{#if showFailedDetails}
							<div
								class="max-h-32 overflow-y-auto rounded-lg bg-[var(--sl-bg-input)] p-2 text-xs text-[var(--sl-text-2)]"
								transition:fade={{ duration: 100 }}
							>
								{#each deviceState.backupState.failedKeys as failed}
									<div class="flex items-center justify-between py-0.5">
										<span class="font-mono">{failed.key}</span>
										<span class="ml-2 shrink-0 text-[var(--sl-text-3)]">{formatReason(failed.reason)}</span>
									</div>
								{/each}
							</div>
						{/if}

						<div class="flex flex-col items-center gap-2">
							<div class="flex justify-center gap-3">
								{#if onRetry}
									<button
										class="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
										onclick={handleRetryFailed}
									>
										<RefreshCw size={16} />
										Retry Failed
									</button>
								{/if}
								<button
									class="flex items-center gap-2 rounded-lg bg-[var(--sl-border)] px-4 py-2 text-sm font-medium text-[var(--sl-text-1)] transition-colors hover:bg-[#475569]"
									onclick={handleDownloadPartial}
								>
									<Download size={16} />
									Download Partial
								</button>
							</div>
							{#if onFullBackup}
								<button
									class="mt-1 text-xs text-[var(--sl-text-3)] transition-colors hover:text-[var(--sl-text-2)]"
									onclick={handleFullBackup}
								>
									Start new full backup
								</button>
							{/if}
						</div>
					</div>
				{:else}
					<div class="mb-4 flex items-center justify-between text-sm">
						<span class="text-[var(--sl-text-2)]">{deviceState.backupState.status}</span>
						<span class="font-medium text-[var(--sl-text-1)]"
							>{Math.round(deviceState.backupState.progress)}%</span
						>
					</div>

					<div class="h-2 w-full overflow-hidden rounded-full bg-[var(--sl-bg-input)]">
						<div
							class="h-full bg-blue-500 transition-all duration-300"
							class:bg-red-500={deviceState.backupState.status.includes('cancelled') ||
								deviceState.backupState.status.includes('failed')}
							class:bg-green-500={deviceState.backupState.progress === 100 &&
								!deviceState.backupState.status.includes('failed')}
							style="width: {deviceState.backupState.progress}%"
						></div>
					</div>

					<div class="mt-6 flex justify-center gap-4">
						{#if deviceState.backupState.isDownloading}
							<button
								class="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/20"
								onclick={handleStop}
							>
								<Square size={16} class="fill-current" />
								Stop Backup
							</button>
						{:else}
							<button
								class="rounded-lg bg-[var(--sl-border)] px-4 py-2 text-sm font-medium text-[var(--sl-text-1)] transition-colors hover:bg-[#475569]"
								onclick={handleClose}
							>
								Close
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
