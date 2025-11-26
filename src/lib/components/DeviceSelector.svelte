<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';

	let { devices } = $props<{ devices: any[] }>();

	async function handleDeviceChange() {
		if (deviceState.selectedDeviceId && logtoClient) {
			const token = await logtoClient.getIdToken();
			if (token) {
				await checkDeviceStatus(deviceState.selectedDeviceId, token);
			}
		}
	}
</script>

<select
	class="select max-w-xs border border-[#334155] bg-[#101a29] select-sm text-white focus:border-violet-300"
	bind:value={deviceState.selectedDeviceId}
	onchange={handleDeviceChange}
>
	<option disabled selected value={undefined}>Select a device</option>
	{#each devices as device}
		<option value={device.device_id}>
			{device.alias ?? device.device_id}
			{deviceState.onlineStatuses[device.device_id ?? ''] === 'online'
				? ' 🟢'
				: deviceState.onlineStatuses[device.device_id ?? ''] === 'offline'
					? ' 🔴'
					: ' ⏳'}
		</option>
	{/each}
</select>
