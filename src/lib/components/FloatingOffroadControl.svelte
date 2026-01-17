<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { fade, fly } from 'svelte/transition';
	import { AlertTriangle, Power, Loader2 } from 'lucide-svelte';
	import FloatingBar from '$lib/components/FloatingBar.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import { v0Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { encodeParamValue } from '$lib/utils/device';

	let { onOpenModal } = $props<{
		onOpenModal: () => void;
	}>();

	let deviceId = $derived(deviceState.selectedDeviceId);
	let offroadStatus = $derived(deviceId ? deviceState.offroadStatuses[deviceId] : undefined);
	let isForceOffroad = $derived(offroadStatus?.forceOffroad ?? false);
	let isOffroad = $derived(offroadStatus?.isOffroad ?? false);
	let isOffline = $derived(deviceId && deviceState.onlineStatuses[deviceId] === 'offline');

	// Conditions to show:
	// 1. Device selected
	// 2. NOT offline
	// 3. Either:
	//    - Force Offroad is active (to disable it)
	//    - Device is ONROAD (to enable it)
	// Note: If device is naturally offroad (and not force offroad), we don't show it?
	// User said: "only display this when the device is onroad or in force offroad to disable the force offroad"
	// So:
	// - If Force Offroad: SHOW (to disable)
	// - If Onroad: SHOW (to enable)
	// - If Offroad (natural): HIDE? (This implies you can't force offroad if already offroad naturally? Usually yes but user request is specific)
	// Let's follow request: "onroad or in force offroad"

	let shouldShow = $derived(
		deviceId && !isOffline && (isForceOffroad || (!isOffroad && !isForceOffroad))
	);
	let changes = $derived(deviceId ? deviceState.stagedChanges[deviceId] : undefined);
	let hasChanges = $derived(changes ? Object.keys(changes).length > 0 : false);

	// So we need to be higher.
	let offsetClass = $derived(hasChanges ? 'bottom-20 sm:bottom-24' : 'bottom-6 sm:bottom-10');

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

			await v0Client.POST('/settings/{deviceId}', {
				params: { path: { deviceId } },
				body: payload,
				headers: { Authorization: `Bearer ${token}` }
			});

			// Refresh status
			await checkDeviceStatus(deviceId, token);
		} catch (e) {
			console.error('Failed to stop forcing offroad', e);
		} finally {
			stopping = false;
		}
	}
</script>

{#if shouldShow}
	<FloatingBar bottomOffsetClass={offsetClass} color="amber">
		{#snippet children()}
			<div class="flex items-center gap-3 border-r border-amber-500/20 pr-4">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-500"
				>
					{#if isForceOffroad}
						<AlertTriangle size={16} />
					{:else}
						<Power size={16} />
					{/if}
				</div>
				<span class="text-sm font-medium text-white">
					{#if isForceOffroad}
						Force Offroad Active
					{:else}
						Ready to Offroad
					{/if}
				</span>
			</div>
		{/snippet}

		{#snippet actionSection()}
			<button
				class="btn text-amber-500 btn-ghost btn-sm hover:bg-amber-500/10 hover:text-amber-400"
				onclick={isForceOffroad ? stopForcing : onOpenModal}
				disabled={stopping}
			>
				{#if stopping}
					<Loader2 size={16} class="animate-spin" />
				{:else if isForceOffroad}
					Stop Forcing
				{:else}
					Force Offroad
				{/if}
			</button>
		{/snippet}
	</FloatingBar>
{/if}
