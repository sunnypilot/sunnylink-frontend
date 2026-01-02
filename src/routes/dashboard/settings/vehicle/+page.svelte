<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import VehicleSelector from '$lib/components/vehicle/VehicleSelector.svelte';
	import { goto } from '$app/navigation';

	let deviceId = $derived(deviceState.selectedDeviceId);

	$effect(() => {
		if (!deviceId) {
			goto('/dashboard');
		}
	});
</script>

<div class="mx-auto max-w-7xl px-4 py-6 md:px-0">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-white">Vehicle Settings</h1>
		<p class="mt-2 text-slate-400">Manage your vehicle fingerprint and platform selection.</p>
	</div>

	{#if deviceId}
		<VehicleSelector {deviceId} />
	{/if}
</div>
