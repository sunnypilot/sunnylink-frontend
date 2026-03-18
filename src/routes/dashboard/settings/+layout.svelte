<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { settingsGate } from '$lib/stores/settingsGate.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import DeviceOnlineModal from '$lib/components/DeviceOnlineModal.svelte';

	let { children, data } = $props();

	let devices = $state<any[]>([]);
	let deviceOnlineModalOpen = $state(false);

	$effect(() => {
		if (data.streamed.devices) {
			data.streamed.devices.then((d: any[]) => {
				devices = d || [];
			});
		}
	});

	let deviceId = $derived(deviceState.selectedDeviceId);
	let isOffline = $derived(deviceId ? deviceState.onlineStatuses[deviceId] === 'offline' : false);

	let selectedDevice = $derived.by(() => {
		if (!deviceId) return undefined;
		return devices.find((d: { device_id: string | null }) => d.device_id === deviceId);
	});

	// Drive the shared gate store — only for offline (no_device is handled inline by each page)
	$effect(() => {
		settingsGate.devices = devices;
		settingsGate.onRetry = handleRetry;

		if (deviceId && isOffline) {
			settingsGate.active = true;
			settingsGate.deviceName = deviceState.aliases[deviceId] ?? selectedDevice?.alias ?? deviceId;
			settingsGate.deviceId = selectedDevice?.device_id ?? deviceId;
		} else {
			settingsGate.active = false;
		}

		return () => {
			settingsGate.active = false;
		};
	});

	$effect(() => {
		if (deviceId && preferences.showDeviceOnlineHelp) {
			deviceOnlineModalOpen = true;
		}
	});

	async function handleRetry() {
		if (!deviceId || !logtoClient) return;
		settingsGate.retrying = true;
		try {
			const token = await logtoClient.getIdToken();
			if (token) await checkDeviceStatus(deviceId, token);
		} finally {
			settingsGate.retrying = false;
		}
	}
</script>

{@render children()}

<DeviceOnlineModal bind:open={deviceOnlineModalOpen} />
