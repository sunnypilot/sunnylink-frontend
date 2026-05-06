<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { Athenav0Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { encodeParamValue } from '$lib/utils/device';
	import { checkDeviceStatus } from '$lib/api/device';
	import { Loader2, AlertTriangle } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';
	import { driftStore } from '$lib/stores/driftStore.svelte';

	let { open = $bindable(false), onSuccess } = $props<{
		open: boolean;
		onSuccess: () => void;
	}>();

	let deviceId = $derived(deviceState.selectedDeviceId);
	let pushing = $state(false);
	let error = $state<string | null>(null);
	let confirmed = $state(false);

	$effect(() => {
		if (open) {
			// Reset state when opening
			confirmed = false;
			error = null;
		}
	});

	async function handleForceOffroad() {
		if (!deviceId || !confirmed) return;

		pushing = true;
		error = null;

		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');

			// Prepare payload for OffroadMode
			const payload = [
				{
					key: 'OffroadMode',
					value: encodeParamValue({
						key: 'OffroadMode',
						value: '1', // True
						type: 'Bool'
					}),
					is_compressed: false
				}
			];

			const response = await Athenav0Client.POST('/settings/{deviceId}', {
				params: {
					path: { deviceId }
				},
				body: payload,
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (response.error) {
				throw new Error(response.error.detail || 'Failed to force offroad mode');
			}

			// Success
			if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
			deviceState.deviceValues[deviceId]['OffroadMode'] = true;
			// Optimistic: device received OffroadMode=1 and will stop immediately.
			// Setting isOffroad=true unlocks offroad_only settings without waiting
			// for the next status poll. checkDeviceStatus below confirms actual state.
			deviceState.offroadStatuses[deviceId] = {
				isOffroad: true,
				forceOffroad: true
			};
			const baseline = driftStore.getBaseline(deviceId);
			if (Object.keys(baseline).length > 0) {
				driftStore.updateBaseline(deviceId, { ...baseline, OffroadMode: true });
			}
			driftStore.resolveKeys(deviceId, ['OffroadMode']);
			// Invalidate caches so settings/models/osm pages re-fetch values against
			// the new offroad state (mirrors DeviceStatusPill.onForceOffroadSuccess).
			deviceState.invalidateAll(deviceId);
			onSuccess();
			open = false;
			// Background status recheck — updates offroadStatuses from live device
			// state and re-triggers the layout prefetch via valuesStale.
			checkDeviceStatus(deviceId, token, true).catch((err) => {
				console.error('Background status refresh after ForceOffroad failed', err);
			});
		} catch (e: any) {
			console.error('Force offroad failed', e);
			error = e.message || 'Failed to force offroad mode';
		} finally {
			pushing = false;
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-0"
		role="dialog"
		aria-modal="true"
		use:portal
		use:modalLock
	>
		<button
			class="absolute inset-0 bg-[var(--sl-overlay)]"
			transition:fade={{ duration: 200 }}
			onclick={() => {
				if (!pushing) open = false;
			}}
			aria-label="Close modal"
			disabled={pushing}
		></button>
		<div
			class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-red-500/30 bg-[var(--sl-bg-elevated)] shadow-2xl"
			transition:fly={{ y: 8, duration: 150, easing: cubicOut, opacity: 0 }}
		>
			<div class="border-b border-red-500/20 bg-red-500/10 p-6">
				<div class="flex items-center gap-3 text-red-500">
					<AlertTriangle size={28} />
					<h3 class="text-xl font-bold">Enable Always Offroad Mode</h3>
				</div>
			</div>

			<div class="p-6">
				<div class="mb-6 space-y-4 text-[var(--sl-text-2)]">
					<p class="font-semibold text-[var(--sl-text-1)]">
						WARNING: This action will immediately stop the vehicle from engaging.
					</p>
					<p>
						Enabling Always Offroad Mode while driving is extremely dangerous and will cause
						sunnypilot to disengage immediately.
					</p>
					<p>
						Only proceed if the vehicle is parked and you need to keep the device in offroad mode
						for maintenance or updates.
					</p>
				</div>

				{#if error}
					<div
						class="mb-6 flex items-center gap-3 rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-500/10 dark:text-red-400"
					>
						<AlertTriangle size={20} />
						<p>{error}</p>
					</div>
				{/if}

				<div class="form-control">
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="checkbox"
							bind:checked={confirmed}
							class="checkbox h-6 w-6 checkbox-error"
						/>
						<span
							class="label-text pr-1 text-sm leading-relaxed break-words whitespace-normal text-[var(--sl-text-1)]"
							>I understand the risks and want to proceed</span
						>
					</label>
				</div>
			</div>

			<div
				class="flex justify-end gap-3 border-t border-[var(--sl-border)] bg-[var(--sl-bg-input)] p-6"
			>
				<button
					class="btn text-[var(--sl-text-2)] btn-ghost transition-transform hover:text-[var(--sl-text-1)] active:scale-[0.98]"
					onclick={() => (open = false)}
					disabled={pushing}
				>
					Cancel
				</button>
				<button
					class="btn min-w-[140px] transition-transform btn-error active:scale-[0.98] active:brightness-90"
					onclick={handleForceOffroad}
					disabled={!confirmed || pushing}
				>
					{#if pushing}
						<Loader2 size={18} class="mr-2 animate-spin" />
						Enabling...
					{:else}
						Enable Always Offroad Mode
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
