<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { v0Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { encodeParamValue } from '$lib/utils/device';
	import { Loader2, AlertTriangle } from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';

	let { open = $bindable(false), onSuccess } = $props<{
		open: boolean;
		onSuccess: () => void;
	}>();

	let deviceId = $derived(deviceState.selectedDeviceId);
	let pushing = $state(false);
	let error = $state<string | null>(null);
	let confirmed = $state(false);
	let countdown = $state(5);
	let timer: ReturnType<typeof setInterval>;

	$effect(() => {
		if (open) {
			// Reset state when opening
			confirmed = false;
			countdown = 5;
			error = null;
			startTimer();
		} else {
			stopTimer();
		}
	});

	function startTimer() {
		stopTimer();
		timer = setInterval(() => {
			if (countdown > 0) {
				countdown--;
			} else {
				stopTimer();
			}
		}, 1000);
	}

	function stopTimer() {
		if (timer) clearInterval(timer);
	}

	onDestroy(() => {
		stopTimer();
	});

	async function handleForceOffroad() {
		if (!deviceId || !confirmed || countdown > 0) return;

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

			const response = await v0Client.POST('/settings/{deviceId}', {
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
			onSuccess();
			open = false;
		} catch (e: any) {
			console.error('Force offroad failed', e);
			error = e.message || 'Failed to force offroad mode';
		} finally {
			pushing = false;
		}
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
		<div
			class="w-full max-w-lg overflow-hidden rounded-xl border border-red-500/30 bg-[#1e293b] shadow-2xl"
		>
			<div class="border-b border-red-500/20 bg-red-500/10 p-6">
				<div class="flex items-center gap-3 text-red-500">
					<AlertTriangle size={28} />
					<h3 class="text-xl font-bold">Force Offroad Mode</h3>
				</div>
			</div>

			<div class="p-6">
				<div class="mb-6 space-y-4 text-slate-300">
					<p class="font-semibold text-white">
						WARNING: This action will immediately stop the vehicle from engaging.
					</p>
					<p>
						Forcing offroad mode while driving is extremely dangerous and will cause openpilot to
						disengage immediately.
					</p>
					<p>
						Only proceed if the vehicle is parked and you need to force the device into offroad mode
						for maintenance or updates.
					</p>
				</div>

				{#if error}
					<div class="mb-6 flex items-center gap-3 rounded-lg bg-red-500/10 p-4 text-red-400">
						<AlertTriangle size={20} />
						<p>{error}</p>
					</div>
				{/if}

				<div class="form-control">
					<label class="label cursor-pointer justify-start gap-3">
						<input type="checkbox" bind:checked={confirmed} class="checkbox checkbox-error" />
						<span class="label-text text-white">I understand the risks and want to proceed</span>
					</label>
				</div>
			</div>

			<div class="flex justify-end gap-3 border-t border-[#334155] bg-[#0f1726] p-6">
				<button
					class="btn text-slate-400 btn-ghost hover:text-white"
					onclick={() => (open = false)}
					disabled={pushing}
				>
					Cancel
				</button>
				<button
					class="btn min-w-[140px] btn-error"
					onclick={handleForceOffroad}
					disabled={!confirmed || countdown > 0 || pushing}
				>
					{#if pushing}
						<Loader2 size={18} class="mr-2 animate-spin" />
						Forcing...
					{:else if countdown > 0}
						Wait {countdown}s
					{:else}
						Force Offroad
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
