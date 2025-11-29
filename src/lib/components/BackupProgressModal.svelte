<script lang="ts">
	import { Loader2, X, Minimize2, Square } from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';
	import { deviceState } from '$lib/stores/device.svelte';

	let { open = $bindable(false) } = $props();

	let showConfirmStop = $state(false);

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
						{deviceState.backupState.isDownloading ? 'Downloading Backup' : 'Backup Status'}
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
