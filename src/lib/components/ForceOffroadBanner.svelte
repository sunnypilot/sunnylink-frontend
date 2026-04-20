<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { Athenav0Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { encodeParamValue } from '$lib/utils/device';
	import { AlertTriangle, Loader2 } from 'lucide-svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import { driftStore } from '$lib/stores/driftStore.svelte';
	import { slide } from 'svelte/transition';

	let deviceId = $derived(deviceState.selectedDeviceId);
	let offroadStatus = $derived(deviceId ? deviceState.offroadStatuses[deviceId] : undefined);
	let offroadModeParam = $derived(
		deviceId ? deviceState.deviceValues[deviceId]?.['OffroadMode'] : undefined
	);
	let isForceOffroad = $derived.by(() => {
		const fromStatus = offroadStatus?.forceOffroad ?? false;
		const fromParam =
			offroadModeParam === true ||
			offroadModeParam === 1 ||
			offroadModeParam === '1' ||
			offroadModeParam === 'true';
		return fromStatus || fromParam;
	});

	let stopping = $state(false);

	async function stopForcing() {
		if (!deviceId) return;
		stopping = true;
		try {
			const token = await logtoClient?.getIdToken();
			if (!token) return;

			// Set OffroadMode to false
			const payload = [
				{
					key: 'OffroadMode',
					value: encodeParamValue({
						key: 'OffroadMode',
						value: false, // False
						type: 'Bool'
					}),
					is_compressed: false
				}
			];

			await Athenav0Client.POST('/settings/{deviceId}', {
				params: { path: { deviceId } },
				body: payload,
				headers: { Authorization: `Bearer ${token}` }
			});

			if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
			deviceState.deviceValues[deviceId]['OffroadMode'] = false;
			deviceState.offroadStatuses[deviceId] = {
				isOffroad: deviceState.offroadStatuses[deviceId]?.isOffroad ?? true,
				forceOffroad: false
			};
			const baseline = driftStore.getBaseline(deviceId);
			if (Object.keys(baseline).length > 0) {
				driftStore.updateBaseline(deviceId, { ...baseline, OffroadMode: false });
			}
			driftStore.resolveKeys(deviceId, ['OffroadMode']);

			// Refresh status
			await checkDeviceStatus(deviceId, token, true);
		} catch (e) {
			console.error('Failed to stop forcing offroad', e);
		} finally {
			stopping = false;
		}
	}
</script>

{#if isForceOffroad}
	<div
		class="sticky top-0 z-[60] mb-4 w-full rounded-lg border border-amber-500/50 bg-[var(--sl-bg-elevated)]"
		transition:slide={{ duration: 200 }}
	>
		<div class="mx-auto flex max-w-7xl items-center justify-between gap-4 p-4 sm:px-6 lg:px-8">
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"
				>
					<AlertTriangle size={20} />
				</div>
				<div>
					<p class="font-bold text-[var(--sl-text-1)]">Always Offroad Mode</p>
					<p class="text-xs text-[var(--sl-text-2)]">Vehicle engagement is disabled.</p>
				</div>
			</div>
			{#if stopping}
				<Loader2 size={30} class="mr-2 animate-spin text-[var(--sl-text-1)]" />
			{:else}
				<button class="btn btn-sm btn-warning" onclick={stopForcing} disabled={stopping}>
					Disable Always Offroad Mode
				</button>
			{/if}
		</div>
	</div>
{/if}
