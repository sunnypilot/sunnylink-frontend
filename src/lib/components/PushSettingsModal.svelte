<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { v0Client, v1Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { encodeParamValue, decodeParamValue } from '$lib/utils/device';
	import { SETTINGS_DEFINITIONS } from '$lib/types/settings';
	import { Loader2, AlertTriangle, ArrowRight } from 'lucide-svelte';

	let { open = $bindable(false), onPushSuccess } = $props<{
		open: boolean;
		onPushSuccess: () => void;
	}>();

	let deviceId = $derived(deviceState.selectedDeviceId);
	let changes = $derived(deviceId ? deviceState.stagedChanges[deviceId] : {});
	let changeList = $derived(
		Object.entries(changes || {}).map(([key, value]) => {
			const def = SETTINGS_DEFINITIONS.find((d) => d.key === key);
			const originalValue = deviceState.deviceValues[deviceId!]?.[key];
			return {
				key,
				label: def?.label || key,
				value,
				originalValue,
				def
			};
		})
	);

	let pushing = $state(false);
	let fetchingLatest = $state(false);
	let error = $state<string | undefined>(undefined);

	$effect(() => {
		if (open && deviceId && logtoClient) {
			fetchLatestAndPrune();
		}
	});

	async function fetchLatestAndPrune() {
		if (!deviceId || !logtoClient) return;

		fetchingLatest = true;
		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;

			const keys = Object.keys(changes || {});
			if (keys.length === 0) return;

			const response = await v1Client.GET('/v1/settings/{deviceId}/values', {
				params: {
					path: { deviceId },
					query: { paramKeys: keys }
				},
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (response.data?.items) {
				// Update local values
				if (!deviceState.deviceValues[deviceId]) {
					deviceState.deviceValues[deviceId] = {};
				}

				for (const item of response.data.items) {
					if (item.key && item.value !== undefined) {
						// We need to decode. We can use the helper but we need the type.
						// We can find the type from definitions.
						const def = SETTINGS_DEFINITIONS.find((d) => d.key === item.key);
						// Or infer from current value if exists?
						// Let's assume String if unknown, decodeParamValue handles it.
						// But wait, decodeParamValue needs the type to parse bools/ints correctly.
						// We should try to find the definition.

						// Actually, we can just use the type from the item if the API returns it?
						// The API returns { key, value } (value is base64 string). It doesn't return type in 'items' usually?
						// Wait, v1/settings/{deviceId}/values returns DeviceParam[] which has type!

						// Let's check decodeParamValue signature.
						// export function decodeParamValue(param: DeviceParam): unknown
						// DeviceParam has 'type'.

						const decoded = decodeParamValue(item);
						deviceState.deviceValues[deviceId][item.key] = decoded;
					}
				}

				// Prune changes
				deviceState.pruneChanges(deviceId);

				// If no changes left, close modal
				if (!deviceState.hasChanges(deviceId)) {
					open = false;
				}
			}
		} catch (e) {
			console.error('Failed to fetch latest values:', e);
		} finally {
			fetchingLatest = false;
		}
	}

	async function confirmPush() {
		if (!deviceId || !logtoClient) return;

		pushing = true;
		error = undefined;

		try {
			const token = await logtoClient.getIdToken();
			if (!token) throw new Error('Not authenticated');

			const paramsToPush = changeList.map((item) => {
				let stringValue = String(item.value);

				// Handle specific types if needed
				// For boolean, we might want "1"/"0" or "true"/"false" depending on what the device expects.
				// Based on decodeParamValue, "1" or "true" works for true.
				// Let's assume "1" and "0" for booleans to be safe/standard for C++ params often used in openpilot.
				// But wait, decodeParamValue handles 'true' too.
				// Let's look at the type if available.
				// If we don't have the type from definition, we might guess from the value type.

				if (typeof item.value === 'boolean') {
					stringValue = item.value ? '1' : '0';
				} else if (typeof item.value === 'object') {
					stringValue = JSON.stringify(item.value);
				}

				return {
					key: item.key,
					value: encodeParamValue({
						key: item.key,
						value: stringValue
					})
				};
			});

			await v0Client.POST('/settings/{deviceId}', {
				params: {
					path: { deviceId }
				},
				body: paramsToPush,
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			// Success
			// Update local deviceValues with the pushed values
			if (deviceState.deviceValues[deviceId]) {
				for (const item of changeList) {
					deviceState.deviceValues[deviceId][item.key] = item.value;
				}
			}

			// Clear staged changes
			deviceState.clearChanges(deviceId);

			onPushSuccess();
			open = false;
		} catch (e: any) {
			console.error('Failed to push settings:', e);
			error = e.message || 'Failed to push settings';
		} finally {
			pushing = false;
		}
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div
			class="w-full max-w-2xl overflow-hidden rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl"
		>
			<div class="border-b border-[#334155] bg-[#0f1726] p-6">
				<h3 class="text-xl font-bold text-white">Review Changes</h3>
				<p class="mt-1 text-slate-400">
					You are about to push {changeList.length} setting{changeList.length === 1 ? '' : 's'} to {deviceId}.
				</p>
			</div>

			<div class="max-h-[60vh] overflow-y-auto p-6">
				{#if fetchingLatest}
					<div class="flex flex-col items-center justify-center py-8 text-slate-400">
						<Loader2 size={32} class="mb-4 animate-spin" />
						<p>Checking for latest changes...</p>
					</div>
				{:else}
					{#if error}
						<div class="mb-6 flex items-center gap-3 rounded-lg bg-red-500/10 p-4 text-red-400">
							<AlertTriangle size={20} />
							<p>{error}</p>
						</div>
					{/if}

					<div class="space-y-4">
						{#each changeList as change}
							<div
								class="flex items-center justify-between rounded-lg border border-[#334155] bg-[#101a29] p-4"
							>
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium text-white">{change.label}</p>
									<p class="font-mono text-xs text-slate-500">{change.key}</p>
								</div>

								<div class="flex items-center gap-4 text-sm">
									<div class="max-w-[150px] truncate text-right text-slate-400">
										{String(change.originalValue ?? 'Undefined')}
									</div>
									<ArrowRight size={16} class="text-slate-600" />
									<div class="max-w-[150px] truncate text-right font-medium text-primary">
										{String(change.value)}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="flex justify-end gap-3 border-t border-[#334155] bg-[#0f1726] p-6">
				<button
					class="btn text-slate-400 btn-ghost hover:text-white"
					onclick={() => (open = false)}
					disabled={pushing || fetchingLatest}
				>
					Cancel
				</button>
				<button
					class="btn min-w-[120px] btn-primary"
					onclick={confirmPush}
					disabled={pushing || fetchingLatest || changeList.length === 0}
				>
					{#if pushing}
						<Loader2 size={18} class="mr-2 animate-spin" />
						Pushing...
					{:else}
						Confirm & Push
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
