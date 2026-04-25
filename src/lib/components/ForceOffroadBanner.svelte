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
		role="status"
		aria-live="polite"
		class="w-full border-b border-amber-500/20 bg-amber-500/8 dark:bg-amber-500/10"
		transition:slide={{ duration: 200 }}
	>
		<div
			class="mx-auto flex min-h-[44px] max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:gap-4 sm:px-6 lg:px-8"
		>
			<div class="flex min-w-0 items-center gap-2.5">
				<AlertTriangle
					size={16}
					class="shrink-0 text-amber-600 dark:text-amber-400"
					aria-hidden="true"
				/>
				<p class="text-[0.8125rem] leading-snug text-amber-700 dark:text-amber-300">
					<span class="font-medium">Always Offroad Mode Active</span>
					<span class="text-amber-700/80 dark:text-amber-300/80">
						• sunnypilot will not engage or enable dashcam recording
					</span>
				</p>
			</div>
			<button
				type="button"
				onclick={stopForcing}
				disabled={stopping}
				class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/15 px-3 text-[0.75rem] font-medium text-amber-700 transition-all duration-100 hover:bg-amber-500/25 focus-visible:outline-2 focus-visible:outline-amber-600 active:scale-[0.96] active:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30"
				aria-label="Disable Always Offroad Mode"
			>
				{#if stopping}
					<Loader2 size={12} class="animate-spin" aria-hidden="true" />
					<span>Disabling…</span>
				{:else}
					<span>Disable</span>
				{/if}
			</button>
		</div>
	</div>
{/if}
