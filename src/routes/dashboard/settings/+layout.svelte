<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { preferences } from '$lib/stores/preferences.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import {
		loadCachedValues,
		saveCachedValues,
		getLastKnownCommit,
		setLastKnownCommit,
		updateCachedValue
	} from '$lib/stores/valuesCache';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { refreshBanner } from '$lib/stores/refreshBanner.svelte';
	import SettingsRefreshBanner from '$lib/components/SettingsRefreshBanner.svelte';
	import { setDeviceParams } from '$lib/api/device';
	import { encodeParamValue } from '$lib/utils/device';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import type { PendingChange } from '$lib/stores/pendingChanges.svelte';
	import { collectOffroadOnlyKeys } from '$lib/rules/evaluator';
	import { WifiOff, AlertTriangle, Shield, Info, Wifi, RefreshCw } from 'lucide-svelte';
	import { formatRelativeTime } from '$lib/utils/time';
	import { toast } from 'svelte-sonner';

	let { children, data } = $props();

	let retrying = $state(false);
	let lastRetryAt = $state<number | null>(null);
	let retryFailed = $state(false);
	let wasOffline = $state(false);
	let reconnectFlushTimer: ReturnType<typeof setTimeout> | undefined = undefined;
	const RECONNECT_DEBOUNCE_MS = 4_000;

	let deviceId = $derived(deviceState.selectedDeviceId);
	let deviceStatus = $derived(deviceId ? deviceState.onlineStatuses[deviceId] : undefined);

	// Clear refresh-banner entries for the previously selected device when the
	// user switches the device pill — stale "refreshed from device" surfaces
	// should not follow them to a different device.
	let prevSelected: string | null | undefined = null;
	$effect(() => {
		const cur = deviceState.selectedDeviceId;
		if (prevSelected && prevSelected !== cur) {
			refreshBanner.clearDevice(prevSelected);
		}
		prevSelected = cur;
	});
	let isOnline = $derived(deviceStatus === 'online');
	let isDeviceUnavailable = $derived(deviceId ? !isOnline : false);

	let isLoading = $derived(deviceStatus === 'loading' || deviceStatus === undefined);
	let isError = $derived(deviceStatus === 'error');

	// Track when device transitions from offline → online.
	// Debounced flush: give the user the full RECONNECT_DEBOUNCE_MS window to
	// react/edit before pending changes start syncing. No "Push now" button —
	// pace is intentional to discourage rushing.
	function scheduleReconnectFlush(did: string) {
		if (reconnectFlushTimer !== undefined) clearTimeout(reconnectFlushTimer);
		const count = pendingChanges.pendingCount(did);
		if (count === 0) return;
		toast.success(
			`Device reconnected. ${count} pending change${count === 1 ? '' : 's'} will sync shortly.`
		);
		reconnectFlushTimer = setTimeout(() => {
			reconnectFlushTimer = undefined;
			if (!deviceState.onlineStatuses[did] || deviceState.onlineStatuses[did] !== 'online') return;
			flushPendingChanges(did);
		}, RECONNECT_DEBOUNCE_MS);
	}

	$effect(() => {
		if (isOnline && wasOffline) {
			wasOffline = false;
			if (deviceId) {
				if (pendingChanges.hasPending(deviceId)) {
					scheduleReconnectFlush(deviceId);
				} else {
					toast.success('Device reconnected');
				}
			}
		}
		if (isDeviceUnavailable && !isLoading) {
			wasOffline = true;
			if (reconnectFlushTimer !== undefined) {
				clearTimeout(reconnectFlushTimer);
				reconnectFlushTimer = undefined;
			}
		}
	});

	// Also flush on initial load if device is online and has pending changes
	// (no toast — this is the silent first-load path, not a reconnect event).
	$effect(() => {
		if (deviceId && isOnline && pendingChanges.hasPending(deviceId) && !wasOffline) {
			flushPendingChanges(deviceId);
		}
	});

	// Auto-flush blocked changes when device transitions to offroad
	let wasOnroad = false;
	$effect(() => {
		const isOffroad = deviceState.offroadStatuses[deviceId ?? '']?.isOffroad ?? true;
		if (!isOffroad) {
			wasOnroad = true;
		} else if (wasOnroad && isOffroad && deviceId && isOnline) {
			wasOnroad = false;
			// Device went offroad — unblock and re-flush
			pendingChanges.unblockAll(deviceId);
			if (pendingChanges.hasPending(deviceId)) {
				flushPendingChanges(deviceId);
			}
		}
	});

	/** Flush all pending changes to the device via the settings API.
	 *  Offroad-only items are blocked (not pushed) when the device is onroad. */
	async function flushPendingChanges(did: string) {
		if (!logtoClient || pendingChanges.isFlushing(did)) return;

		const token = await logtoClient.getIdToken();
		if (!token) return;

		const pending = pendingChanges.getByStatus(did, 'pending');
		if (pending.length === 0) return;

		// Check offroad state and collect offroad-only keys
		const isOnroad = !(deviceState.offroadStatuses[did]?.isOffroad ?? true);
		const schema = schemaState.schemas[did];
		const offroadKeys = schema ? collectOffroadOnlyKeys(schema) : new Set<string>();

		// Block offroad-only items when device is onroad
		let blockedCount = 0;
		const pushable: PendingChange[] = [];
		for (const change of pending) {
			if (isOnroad && offroadKeys.has(change.key)) {
				pendingChanges.markBlocked(did, change.key);
				blockedCount++;
			} else {
				pushable.push(change);
			}
		}

		if (blockedCount > 0) {
			toast.warning(
				`${blockedCount} change${blockedCount === 1 ? '' : 's'} blocked — vehicle is driving. Will sync when parked.`
			);
		}

		if (pushable.length === 0) {
			return;
		}

		pendingChanges.setFlushing(did, true);

		// Mark pushable as pushing
		for (const change of pushable) pendingChanges.markPushing(did, change.key);

		// Encode all changes and batch into a single API call
		const payload: { key: string; value: string }[] = [];
		const encoded: PendingChange[] = [];
		for (const change of pushable) {
			const deviceParams = deviceState.deviceSettings[did];
			const paramInfo = deviceParams?.find((p: any) => p.key === change.key);
			const type = paramInfo?.type || 'String';
			const enc = encodeParamValue({ key: change.key, value: change.desiredValue, type });
			if (enc !== null) {
				payload.push({ key: change.key, value: enc });
				encoded.push(change);
			} else {
				pendingChanges.markFailed(did, change.key, 'Failed to encode value');
			}
		}

		if (payload.length > 0) {
			try {
				await setDeviceParams(did, payload, token, 20_000);

				// Success: mark all confirmed, update cache
				const gitCommit = (deviceState.deviceValues[did]?.['GitCommit'] as string) || '';
				for (const change of encoded) {
					pendingChanges.markConfirmed(did, change.key);
					if (gitCommit) updateCachedValue(did, gitCommit, change.key, change.desiredValue);
					const baseline = driftStore.getBaseline(did);
					if (Object.keys(baseline).length > 0) {
						driftStore.updateBaseline(did, { ...baseline, [change.key]: change.desiredValue });
					}
					driftStore.resolveKeys(did, [change.key]);
				}
			} catch (e) {
				const eName = (e as { name?: string })?.name;
				// Definite failure: TypeError = no network (request never left browser)
				if (eName === 'TypeError') {
					for (const change of encoded) {
						pendingChanges.markFailed(did, change.key, 'No network connection.');
					}
				} else {
					// Abort, timeout, 5xx — request reached server, device likely
					// processed the write. Treat optimistically.
					for (const change of encoded) {
						pendingChanges.markConfirmed(did, change.key);
						const baseline = driftStore.getBaseline(did);
						if (Object.keys(baseline).length > 0) {
							driftStore.updateBaseline(did, { ...baseline, [change.key]: change.desiredValue });
						}
						driftStore.resolveKeys(did, [change.key]);
					}
				}
			}
		}

		pendingChanges.setFlushing(did, false);

		// Failed changes get a toast
		const failedCount = pendingChanges.failedCount(did);
		if (failedCount > 0) {
			toast.error(`${failedCount} change${failedCount === 1 ? '' : 's'} failed to sync`);
		}
	}

	function retryFailedChanges() {
		if (!deviceId) return;
		const failed = pendingChanges.getByStatus(deviceId, 'failed');
		for (const entry of failed) {
			// Re-enqueue as pending so the next flush picks them up
			pendingChanges.enqueue(deviceId, entry.key, entry.desiredValue, entry.previousValue);
		}
		flushPendingChanges(deviceId);
	}

	// Synchronous cache hydration — runs before first render.
	// Uses getLastKnownCommit() to break the chicken-and-egg.
	// Must be synchronous (not $effect) so cached values are available
	// for the first template render — prevents gray/empty toggles flash.
	function hydrateCacheSync(did: string) {
		if (!did) return;
		const schemaCommit = schemaState.schemas[did]?.schema_version;
		const valuesCommit = deviceState.deviceValues[did]?.['GitCommit'] as string | undefined;
		const lastKnown = getLastKnownCommit(did);
		const commit = valuesCommit || schemaCommit || lastKnown;
		if (!commit) return;

		const cached = loadCachedValues(did, commit);
		if (cached) {
			const existing = deviceState.deviceValues[did];
			if (!existing || Object.keys(existing).length === 0) {
				// No values yet — full hydration
				deviceState.deviceValues[did] = { ...cached };
			} else {
				// Merge: fill in any keys missing from the live store
				let merged = false;
				for (const key in cached) {
					if (existing[key] === undefined) {
						existing[key] = cached[key];
						merged = true;
					}
				}
				if (merged) deviceState.deviceValues[did] = { ...existing };
			}
		}
	}

	// Hydrate immediately for the current device (synchronous, before first render)
	if (deviceState.selectedDeviceId) {
		hydrateCacheSync(deviceState.selectedDeviceId);
	}

	// Capture drift baseline into the persistent driftStore (survives layout unmount).
	function captureDriftBaseline(did: string) {
		if (Object.keys(driftStore.getBaseline(did)).length > 0) return;
		const commit = getLastKnownCommit(did) || '';
		if (!commit) return;
		const cached = loadCachedValues(did, commit);
		if (cached && Object.keys(cached).length > 0) {
			driftStore.captureBaseline(did, cached);
		}
	}
	if (deviceState.selectedDeviceId) {
		captureDriftBaseline(deviceState.selectedDeviceId);
	}

	// Also re-hydrate reactively when device changes (for device switching)
	$effect(() => {
		if (deviceId) {
			captureDriftBaseline(deviceId);
			hydrateCacheSync(deviceId);
		}
	});

	// Save values to cache whenever they change and device is online.
	// Also persists gitCommit separately for next-session cache hydration.
	$effect(() => {
		if (!deviceId || !isOnline) return;
		const values = deviceState.deviceValues[deviceId];
		if (!values || Object.keys(values).length === 0) return;
		const gitCommit = (values['GitCommit'] as string) || '';
		if (gitCommit) {
			saveCachedValues(deviceId, gitCommit, values);
			setLastKnownCommit(deviceId, gitCommit);
		}
	});

	// The global params prefetch (all panel keys, including cross-category
	// gating values like ShowAdvancedControls) runs in the parent
	// dashboard/+layout.svelte so it covers every dashboard route, not just
	// settings pages.

	// Educational banner
	// Shown if user hasn't permanently dismissed AND hasn't session-dismissed.
	let sessionDismissed = $state(false);
	let showOnlineHelp = $derived(
		!!deviceId && preferences.showDeviceOnlineHelp && !sessionDismissed
	);

	function dismissHelp(permanent: boolean) {
		if (permanent) {
			preferences.showDeviceOnlineHelp = false;
		}
		sessionDismissed = true;
	}

	async function handleRetry() {
		if (!deviceId || !logtoClient) return;
		retrying = true;
		retryFailed = false;
		deviceState.valuesVerifiedThisSession[deviceId] = false;
		deviceState.valuesStale[deviceId] = true;
		try {
			const token = await logtoClient.getIdToken();
			if (token) await checkDeviceStatus(deviceId, token, true);
			const statusAfter = deviceState.onlineStatuses[deviceId];
			if (statusAfter !== 'online') {
				retryFailed = true;
				lastRetryAt = Date.now();
			}
		} catch {
			retryFailed = true;
			lastRetryAt = Date.now();
		} finally {
			retrying = false;
		}
	}
</script>

<!-- Educational banner — inline, dismissible, non-blocking, preference-driven -->
{#if showOnlineHelp}
	<div class="mx-auto mb-4 w-full max-w-2xl xl:max-w-3xl">
		<div class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
			<div class="flex items-center gap-3 border-b border-[var(--sl-border)] px-4 py-3">
				<div class="rounded-full bg-primary/10 p-1.5 text-primary">
					<Wifi size={16} />
				</div>
				<p class="flex-1 text-sm font-medium text-[var(--sl-text-1)]">Device Connection Required</p>
				<button
					class="btn text-[var(--sl-text-2)] btn-ghost transition-all duration-100 btn-xs active:scale-[0.94] active:bg-[var(--sl-bg-subtle)]"
					onclick={() => dismissHelp(false)}
				>
					Dismiss
				</button>
			</div>
			<div class="space-y-2 px-4 py-3">
				<div class="flex gap-2.5">
					<Shield class="mt-0.5 shrink-0 text-primary" size={16} />
					<p class="text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
						We do <strong class="text-[var(--sl-text-1)]">not</strong> store your device settings on
						our servers. A direct device connection is required.
					</p>
				</div>
				<div class="flex gap-2.5">
					<Info class="mt-0.5 shrink-0 text-primary" size={16} />
					<p class="text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
						Backups are encrypted with your device's private key. Only your device can decrypt them.
					</p>
				</div>
			</div>
			<div class="flex justify-end border-t border-[var(--sl-border)] px-4 py-2.5">
				<button
					type="button"
					class="btn text-[var(--sl-text-2)] btn-ghost transition-all duration-100 btn-xs active:scale-[0.94] active:bg-[var(--sl-bg-subtle)]"
					onclick={() => dismissHelp(true)}
				>
					Don't show again
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Offline/error banner — inline above content, never replaces it -->
{#if deviceId && isDeviceUnavailable && !isLoading}
	<div class="mx-auto mb-4 w-full max-w-2xl xl:max-w-3xl">
		<div
			class="flex items-center gap-2.5 rounded-lg border px-4 py-2.5
			{isError
				? 'border-orange-500/20 bg-orange-50 dark:bg-orange-500/5'
				: 'border-amber-500/20 bg-amber-50 dark:bg-yellow-500/5'}"
		>
			{#if isError}
				<AlertTriangle size={16} class="shrink-0 text-orange-600 dark:text-orange-400" />
				<div class="flex-1">
					<p class="text-sm text-orange-800 dark:text-orange-200/80">
						<span class="font-medium">Connection error</span> — Unable to reach device. Settings may
						be outdated.
					</p>
					{#if lastRetryAt}
						<p class="mt-0.5 text-[0.6875rem] text-orange-600/60 dark:text-orange-300/50">
							Checked {formatRelativeTime(lastRetryAt)}
						</p>
					{/if}
				</div>
			{:else}
				<WifiOff size={16} class="shrink-0 text-amber-600 dark:text-yellow-500" />
				<div class="flex-1">
					<p class="text-sm text-amber-800 dark:text-yellow-200/80">
						{#if retryFailed}
							<span class="font-medium">Still offline</span> — Device not reachable. Showing cached settings.
						{:else}
							<span class="font-medium">Offline</span> — Showing cached settings. Changes disabled until
							device is online.
						{/if}
					</p>
					{#if lastRetryAt}
						<p class="mt-0.5 text-[0.6875rem] text-amber-600/60 dark:text-yellow-300/50">
							Checked {formatRelativeTime(lastRetryAt)}
						</p>
					{/if}
				</div>
			{/if}
			<button
				class="btn shrink-0 btn-ghost transition-all duration-100 btn-xs active:scale-[0.94] active:bg-[var(--sl-bg-subtle)] disabled:active:scale-100 {isError
					? 'text-orange-700 dark:text-orange-400'
					: 'text-yellow-700 dark:text-yellow-400'}"
				disabled={retrying}
				onclick={handleRetry}
			>
				{#if retrying}
					<span class="loading loading-xs loading-spinner"></span>
					Checking...
				{:else}
					<RefreshCw size={14} />
					Retry
				{/if}
			</button>
		</div>
	</div>
{/if}

<!-- Sync status banner — pending/failed/drift indicators -->

<!-- Settings-refresh banner: "X settings refreshed from device" with jump-to-row
     deep links. Persistent across reloads in the same tab (sessionStorage) so
     driving-companion users can review changes after parking. -->
<SettingsRefreshBanner />

<!-- Always render children — never gate on device status.
     SchemaItemRenderer's pushValue() has its own offline guard.
     Cached values show instantly; fresh values stream in via background fetch. -->
{@render children()}
