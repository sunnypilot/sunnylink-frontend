<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { fade, fly } from 'svelte/transition';
	import { RefreshCw, Save } from 'lucide-svelte';

	let { onPush, onReset } = $props<{
		onPush: () => void;
		onReset: () => void;
	}>();

	let deviceId = $derived(deviceState.selectedDeviceId);
	let changes = $derived(deviceId ? deviceState.stagedChanges[deviceId] : undefined);
	let changeCount = $derived(changes ? Object.keys(changes).length : 0);
</script>

{#if changeCount > 0}
	<div
		transition:fly={{ y: 50, duration: 300 }}
		class="fixed bottom-6 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-4 rounded-full border border-[#334155] bg-[#1e293b]/90 px-6 py-3 shadow-2xl backdrop-blur-md"
	>
		<div class="flex items-center gap-3 border-r border-slate-700 pr-4">
			<div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
				<span class="text-sm font-bold">{changeCount}</span>
			</div>
			<span class="text-sm font-medium text-white">
				{changeCount === 1 ? 'Setting' : 'Settings'} modified
			</span>
		</div>

		<div class="flex items-center gap-2">
			<button
				class="btn text-slate-400 btn-ghost btn-sm hover:bg-slate-700/50 hover:text-white"
				onclick={onReset}
			>
				<RefreshCw size={16} class="mr-2" />
				<span class="hidden sm:inline">Reset</span>
				<span class="sm:hidden">Clear</span>
			</button>
			<button class="btn shadow-lg shadow-primary/20 btn-sm btn-primary" onclick={onPush}>
				<Save size={16} class="mr-2" />
				<span class="hidden sm:inline">Push to Device</span>
				<span class="sm:hidden">Push</span>
			</button>
		</div>
	</div>
{/if}
