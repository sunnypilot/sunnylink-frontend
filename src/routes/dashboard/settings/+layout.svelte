<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import { WifiOff, Loader2, AlertTriangle, Shield, Info, Wifi } from 'lucide-svelte';

	let { children, data } = $props();

	let devices = $state<any[]>([]);
	let retrying = $state(false);

	$effect(() => {
		if (data.streamed.deviceResult) {
			data.streamed.deviceResult.then((result: any) => {
				devices = result.devices || [];
			});
		}
	});

	let deviceId = $derived(deviceState.selectedDeviceId);
	let deviceStatus = $derived(deviceId ? deviceState.onlineStatuses[deviceId] : undefined);
	let isDeviceUnavailable = $derived(deviceId ? deviceStatus !== 'online' : false);

	let selectedDevice = $derived.by(() => {
		if (!deviceId) return undefined;
		return devices.find((d: { device_id: string | null }) => d.device_id === deviceId);
	});

	let deviceDisplayName = $derived(
		deviceState.aliases[deviceId ?? ''] ?? selectedDevice?.alias ?? deviceId ?? 'Unknown'
	);

	let isLoading = $derived(deviceStatus === 'loading' || deviceStatus === undefined);
	let isError = $derived(deviceStatus === 'error');

	// Educational banner — dismissible, shown once
	let showOnlineHelp = $state(false);
	$effect(() => {
		if (deviceId && preferences.showDeviceOnlineHelp) {
			showOnlineHelp = true;
		}
	});

	function dismissHelp(permanent: boolean) {
		if (permanent) {
			preferences.showDeviceOnlineHelp = false;
		}
		showOnlineHelp = false;
	}

	async function handleRetry() {
		if (!deviceId || !logtoClient) return;
		retrying = true;
		try {
			const token = await logtoClient.getIdToken();
			if (token) await checkDeviceStatus(deviceId, token);
		} finally {
			retrying = false;
		}
	}
</script>

<!-- Educational banner — inline, dismissible, non-blocking -->
{#if showOnlineHelp && deviceId && !isDeviceUnavailable}
	<div class="mx-auto mb-4 w-full max-w-2xl xl:max-w-3xl">
		<div class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
			<div class="flex items-center gap-3 border-b border-[var(--sl-border)] px-4 py-3">
				<div class="rounded-full bg-primary/10 p-1.5 text-primary">
					<Wifi size={16} />
				</div>
				<p class="flex-1 text-sm font-medium text-[var(--sl-text-1)]">Device Connection Required</p>
				<button
					class="btn btn-ghost btn-xs text-[var(--sl-text-3)]"
					onclick={() => dismissHelp(false)}
				>
					Dismiss
				</button>
			</div>
			<div class="space-y-2 px-4 py-3">
				<div class="flex gap-2.5">
					<Shield class="mt-0.5 shrink-0 text-primary" size={16} />
					<p class="text-[0.8125rem] text-[var(--sl-text-2)]">
						We do <strong class="text-[var(--sl-text-1)]">not</strong> store your data on our servers. A direct device connection is required.
					</p>
				</div>
				<div class="flex gap-2.5">
					<Info class="mt-0.5 shrink-0 text-primary" size={16} />
					<p class="text-[0.8125rem] text-[var(--sl-text-2)]">
						Backups are encrypted with your device's private key. Only your device can decrypt them.
					</p>
				</div>
			</div>
			<div class="border-t border-[var(--sl-border)] px-4 py-2.5">
				<label class="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-xs checkbox-primary border-slate-500"
						onchange={(e: Event) => {
							if ((e.target as HTMLInputElement).checked) dismissHelp(true);
						}}
					/>
					<span class="text-xs text-[var(--sl-text-3)]">Don't show again</span>
				</label>
			</div>
		</div>
	</div>
{/if}

<!-- Device unavailable — inline content replacement, sidebar/header stay interactive -->
{#if deviceId && isDeviceUnavailable}
	<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
		<div class="flex flex-col items-center justify-center py-16 text-center">
			{#if isLoading}
				<Loader2 class="mb-4 h-10 w-10 animate-spin text-primary" />
				<h3 class="text-lg font-semibold text-[var(--sl-text-1)]">Connecting to Device</h3>
				<p class="mt-1 text-sm text-[var(--sl-text-2)]">{deviceDisplayName}</p>
				<p class="mt-2 text-sm text-[var(--sl-text-3)]">Checking device availability...</p>
			{:else if isError}
				<div class="mb-4 rounded-full bg-orange-500/10 p-4">
					<AlertTriangle class="h-10 w-10 text-orange-500" />
				</div>
				<h3 class="text-lg font-semibold text-[var(--sl-text-1)]">Connection Error</h3>
				<p class="mt-1 text-sm font-medium text-[var(--sl-text-2)]">
					{deviceDisplayName}
					{#if selectedDevice?.device_id && selectedDevice.device_id !== deviceDisplayName}
						<span class="block text-xs font-normal text-[var(--sl-text-3)]">({selectedDevice.device_id})</span>
					{/if}
				</p>
				<p class="mt-2 max-w-md text-sm text-[var(--sl-text-2)]">
					Unable to reach this device. Please check its connectivity and try again.
				</p>
				<button class="btn btn-primary btn-sm mt-4" disabled={retrying} onclick={handleRetry}>
					{#if retrying}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Retry Connection
				</button>
			{:else}
				<div class="mb-4 rounded-full bg-red-500/10 p-4">
					<WifiOff class="h-10 w-10 text-red-500" />
				</div>
				<h3 class="text-lg font-semibold text-[var(--sl-text-1)]">Device Connection Required</h3>
				<p class="mt-1 text-sm font-medium text-[var(--sl-text-2)]">
					{deviceDisplayName}
					{#if selectedDevice?.device_id && selectedDevice.device_id !== deviceDisplayName}
						<span class="block text-xs font-normal text-[var(--sl-text-3)]">({selectedDevice.device_id})</span>
					{/if}
				</p>
				<p class="mt-2 max-w-md text-sm text-[var(--sl-text-2)]">
					This device appears to be offline. Please check its connectivity and try again.
				</p>
				<button class="btn btn-primary btn-sm mt-4" disabled={retrying} onclick={handleRetry}>
					{#if retrying}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					Retry Connection
				</button>
			{/if}

			{#if !isLoading && devices.length > 0}
				<div class="mt-8 w-full max-w-xs">
					<p class="mb-2 text-center text-[0.6875rem] font-medium tracking-wider text-[var(--sl-text-3)] uppercase">
						or select another device
					</p>
					<DeviceSelector {devices} />
				</div>
			{/if}
		</div>
	</div>
{:else}
	{@render children()}
{/if}
