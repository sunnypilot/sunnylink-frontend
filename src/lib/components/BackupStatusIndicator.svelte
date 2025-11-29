<script lang="ts">
	import { Loader2, Maximize2 } from 'lucide-svelte';
	import { fade, slide } from 'svelte/transition';
	import { deviceState } from '$lib/stores/device.svelte';

	function handleOpen() {
		deviceState.openBackupModal();
	}
</script>

{#if deviceState.backupState.isDownloading && !deviceState.backupState.isOpen}
	<div
		class="fixed right-4 bottom-4 z-40 flex w-80 flex-col overflow-hidden rounded-xl border border-[#334155] bg-[#1e293b] shadow-xl"
		transition:slide={{ duration: 300, axis: 'y' }}
	>
		<div
			class="flex items-center justify-between border-b border-[#334155] bg-[#0f1726]/50 px-4 py-3"
		>
			<div class="flex items-center gap-2">
				<Loader2 size={16} class="animate-spin text-blue-500" />
				<span class="text-sm font-medium text-white">Backing up settings...</span>
			</div>
			<button
				onclick={handleOpen}
				class="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
				title="Maximize"
			>
				<Maximize2 size={16} />
			</button>
		</div>

		<div class="p-4">
			<div class="mb-2 flex items-center justify-between text-xs">
				<span class="max-w-[180px] truncate text-slate-400">{deviceState.backupState.status}</span>
				<span class="font-medium text-white">{Math.round(deviceState.backupState.progress)}%</span>
			</div>

			<div class="h-1.5 w-full overflow-hidden rounded-full bg-[#0f1726]">
				<div
					class="h-full bg-blue-500 transition-all duration-300"
					style="width: {deviceState.backupState.progress}%"
				></div>
			</div>
		</div>
	</div>
{/if}
