<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { deviceState } from '$lib/stores/device.svelte';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { Clock, Check } from 'lucide-svelte';

	let deviceId = $derived(deviceState.selectedDeviceId);

	// Count pending (not yet synced) changes across current device
	let pendingCount = $derived(
		deviceId ? pendingChanges.getByStatus(deviceId, 'pending').length : 0
	);

	let pushingCount = $derived(
		deviceId ? pendingChanges.getByStatus(deviceId, 'pushing').length : 0
	);

	let totalPending = $derived(pendingCount + pushingCount);

	// Only show when device is offline/error AND there are pending changes
	let isDeviceUnavailable = $derived(
		deviceId
			? deviceState.onlineStatuses[deviceId] === 'offline' ||
			  deviceState.onlineStatuses[deviceId] === 'error'
			: false
	);

	let showPill = $derived(totalPending > 0 && isDeviceUnavailable);

	// Track "just synced" state for the checkmark flash
	let justSynced = $state(false);
	let prevPending = $state(0);

	$effect(() => {
		const current = totalPending;
		if (prevPending > 0 && current === 0 && !isDeviceUnavailable) {
			justSynced = true;
			setTimeout(() => { justSynced = false; }, 3000);
		}
		prevPending = current;
	});
</script>

{#if showPill}
	<div
		class="fixed bottom-6 left-1/2 z-[9998] -translate-x-1/2"
		transition:fly={{ y: 40, duration: 300 }}
	>
		<div class="flex items-center gap-2 rounded-full border border-amber-500/30 bg-[var(--sl-bg-surface)] px-4 py-2 shadow-lg">
			<Clock size={14} class="text-amber-400" />
			<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
				{totalPending} change{totalPending === 1 ? '' : 's'} pending
			</span>
			<span class="text-[0.75rem] text-[var(--sl-text-3)]">
				Waiting for device to reconnect
			</span>
		</div>
	</div>
{:else if justSynced}
	<div
		class="fixed bottom-6 left-1/2 z-[9998] -translate-x-1/2"
		transition:fly={{ y: 40, duration: 300 }}
	>
		<div class="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-[var(--sl-bg-surface)] px-4 py-2 shadow-lg">
			<Check size={14} class="text-emerald-400" />
			<span class="text-[0.8125rem] font-medium text-emerald-400">
				Changes synced
			</span>
		</div>
	</div>
{/if}
