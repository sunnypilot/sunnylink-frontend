<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { v0Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { encodeParamValue } from '$lib/utils/device';
	import { AlertTriangle, Loader2 } from 'lucide-svelte';
	import { checkDeviceStatus } from '$lib/api/device';

	let deviceId = $derived(deviceState.selectedDeviceId);
	let offroadStatus = $derived(deviceId ? deviceState.offroadStatuses[deviceId] : undefined);
	let isForceOffroad = $derived(offroadStatus?.forceOffroad ?? false);

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

{#if isForceOffroad}
	<div class="sticky top-0 z-[60] mb-4 w-full rounded-lg border border-amber-500/50 bg-[#1e293b]">
		<div class="mx-auto flex max-w-7xl items-center justify-between gap-4 p-4 sm:px-6 lg:px-8">
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-500"
				>
					<AlertTriangle size={20} />
				</div>
				<div>
					<p class="font-bold text-white">Force Offroad Active</p>
					<p class="text-xs text-slate-400">Vehicle engagement is disabled.</p>
				</div>
			</div>
			<button class="btn btn-sm btn-warning" onclick={stopForcing} disabled={stopping}>
				{#if stopping}
					<Loader2 size={20} class="animate-spin text-white mr-2" title="Stopping..." />
				{:else}
					Stop Forcing
				{/if}
			</button>
		</div>
	</div>
{/if}
