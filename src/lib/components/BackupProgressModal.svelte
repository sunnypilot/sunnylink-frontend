<script lang="ts">
	import { Loader2, X, Minimize2, Square, Download, RefreshCw, AlertTriangle } from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';
	import { deviceState } from '$lib/stores/device.svelte';
	import { downloadSettingsBackup } from '$lib/utils/settings';

	let { open = $bindable(false), onRetry }: { open?: boolean; onRetry?: () => void } = $props();

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

	const hasFailedKeys = $derived(
		deviceState.backupState.failedKeys.length > 0 && !deviceState.backupState.isDownloading
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
			class="w-full max-w-md overflow-hidden rounded-2xl border border-[#334155] bg-[#1e293b] shadow-2xl"
			transition:scale={{ duration: 200, start: 0.95 }}
		>
			<div class="border-b border-[#334155] bg-[#0f1726]/50 p-4">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-semibold text-white">
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
								class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
								title="Minimize to background"
							>
								<Minimize2 size={20} />
							</button>
						{:else if !deviceState.backupState.isDownloading}
							<button
								onclick={handleClose}
								class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
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
						<p class="mb-6 text-slate-300">
							Are you sure you want to stop the backup? Progress will be lost.
						</p>
						<div class="flex gap-4">
							<button
								class="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600"
								onclick={cancelStop}
							>
								Cancel
							</button>
							<button
								class="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
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
							<div class="text-sm text-slate-300">
								<p class="font-medium text-amber-400">
									{deviceState.backupState.failedKeys.length} settings could not be fetched
								</p>
								<p class="mt-1">You can retry the failed settings or download a partial backup.</p>
							</div>
						</div>

						<button
							class="text-left text-xs text-slate-400 hover:text-slate-300"
							aria-expanded={showFailedDetails}
							onclick={() => (showFailedDetails = !showFailedDetails)}
						>
							{showFailedDetails ? 'Hide' : 'Show'} failed keys ({deviceState.backupState.failedKeys
								.length})
						</button>

						{#if showFailedDetails}
							<div
								class="max-h-32 overflow-y-auto rounded-lg bg-[#0f1726] p-2 text-xs text-slate-400"
								transition:fade={{ duration: 100 }}
							>
								{#each deviceState.backupState.failedKeys as failed}
									<div class="flex items-center justify-between py-0.5">
										<span class="font-mono">{failed.key}</span>
										<span class="ml-2 shrink-0 text-slate-500">{formatReason(failed.reason)}</span>
									</div>
								{/each}
							</div>
						{/if}

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
								class="flex items-center gap-2 rounded-lg bg-[#334155] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#475569]"
								onclick={handleDownloadPartial}
							>
								<Download size={16} />
								Download Partial
							</button>
						</div>
					</div>
				{:else}
					<div class="mb-4 flex items-center justify-between text-sm">
						<span class="text-slate-300">{deviceState.backupState.status}</span>
						<span class="font-medium text-white"
							>{Math.round(deviceState.backupState.progress)}%</span
						>
					</div>

					<div class="h-2 w-full overflow-hidden rounded-full bg-[#0f1726]">
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
								class="rounded-lg bg-[#334155] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#475569]"
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
