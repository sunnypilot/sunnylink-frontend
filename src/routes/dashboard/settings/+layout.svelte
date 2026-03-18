<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import { loadCachedValues, saveCachedValues } from '$lib/stores/valuesCache';
	import { WifiOff, AlertTriangle, Shield, Info, Wifi, RefreshCw } from 'lucide-svelte';
	import SyncStatusBanner from '$lib/components/SyncStatusBanner.svelte';

	let { children, data } = $props();

	let retrying = $state(false);

	let deviceId = $derived(deviceState.selectedDeviceId);
	let deviceStatus = $derived(deviceId ? deviceState.onlineStatuses[deviceId] : undefined);
	let isOnline = $derived(deviceStatus === 'online');
	let isDeviceUnavailable = $derived(deviceId ? !isOnline : false);

	let isLoading = $derived(deviceStatus === 'loading' || deviceStatus === undefined);
	let isError = $derived(deviceStatus === 'error');

	// Load cached values into device state on mount
	$effect(() => {
		if (!deviceId) return;
		const gitCommit = schemaState.schemas[deviceId]?.schema_version;
		// Try to use GitCommit from any existing device values
		const storedCommit = deviceState.deviceValues[deviceId]?.['GitCommit'] as string | undefined;
		const commit = storedCommit || gitCommit;
		if (!commit) return;

		const cached = loadCachedValues(deviceId, commit);
		if (cached && (!deviceState.deviceValues[deviceId] || Object.keys(deviceState.deviceValues[deviceId]).length === 0)) {
			deviceState.deviceValues[deviceId] = { ...cached };
		}
	});

	// Save values to cache whenever they change and device is online
	$effect(() => {
		if (!deviceId || !isOnline) return;
		const values = deviceState.deviceValues[deviceId];
		if (!values || Object.keys(values).length === 0) return;
		const gitCommit = (values['GitCommit'] as string) || '';
		if (gitCommit) {
			saveCachedValues(deviceId, gitCommit, values);
		}
	});

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
{#if showOnlineHelp && deviceId && isOnline}
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

<!-- Offline/error banner — inline above content, never replaces it -->
{#if deviceId && isDeviceUnavailable && !isLoading}
	<div class="mx-auto mb-4 w-full max-w-2xl xl:max-w-3xl">
		<div class="flex items-center gap-2.5 rounded-lg border px-4 py-2.5
			{isError ? 'border-orange-500/20 bg-orange-500/5' : 'border-yellow-500/20 bg-yellow-500/5'}">
			{#if isError}
				<AlertTriangle size={16} class="shrink-0 text-orange-400" />
				<p class="flex-1 text-sm text-orange-200/80">
					<span class="font-medium">Connection error</span> — Unable to reach device. Settings may be outdated.
				</p>
			{:else}
				<WifiOff size={16} class="shrink-0 text-yellow-500" />
				<p class="flex-1 text-sm text-yellow-200/80">
					<span class="font-medium">Offline</span> — Showing cached settings. Changes disabled until device is online.
				</p>
			{/if}
			<button class="btn btn-ghost btn-xs {isError ? 'text-orange-400' : 'text-yellow-400'}" disabled={retrying} onclick={handleRetry}>
				{#if retrying}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<RefreshCw size={14} />
				{/if}
				Retry
			</button>
		</div>
	</div>
{/if}

<!-- Sync status banner — pending/failed/drift indicators -->
{#if deviceId}
	<SyncStatusBanner {deviceId} />
{/if}

<!-- Always render children — never gate on device status.
     SchemaItemRenderer's pushValue() has its own offline guard.
     Cached values show instantly; fresh values stream in via background fetch. -->
{@render children()}
