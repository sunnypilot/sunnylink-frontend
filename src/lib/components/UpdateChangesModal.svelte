<script lang="ts">
	import { v0Client, v1Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { Loader2, ArrowRight, AlertCircle, Settings2 } from 'lucide-svelte';
	import { encodeParamValue } from '$lib/utils/device';

	let {
		open = $bindable(false),
		aliasChanges = [],
		settingChanges = []
	} = $props<{
		open: boolean;
		aliasChanges: Array<{
			deviceId: string;
			oldAlias: string;
			newAlias: string;
		}>;
		settingChanges: Array<{
			deviceId: string;
			key: string;
			value: any;
			originalValue: any;
		}>;
	}>();

	let saving = $state(false);
	let error = $state<string | undefined>(undefined);
	let successCount = $state(0);

	let totalChanges = $derived(aliasChanges.length + settingChanges.length);

	$effect(() => {
		if (open) {
			error = undefined;
			successCount = 0;
		}
	});

	async function handleSave() {
		if (!logtoClient || totalChanges === 0) return;

		saving = true;
		error = undefined;
		successCount = 0;

		try {
			const token = await logtoClient.getIdToken();
			if (!token) throw new Error('Not authenticated');

			// Process Alias Updates
			for (const change of aliasChanges) {
				const response = await v0Client.PATCH('/device/{deviceId}', {
					params: {
						path: { deviceId: change.deviceId }
					},
					body: {
						alias: change.newAlias
					},
					headers: {
						Authorization: `Bearer ${token}`
					}
				});

				if (response.error) {
					throw new Error(
						`Failed to update alias for ${change.deviceId}: ${response.error.detail || 'Unknown error'}`
					);
				}

				deviceState.updateAlias(change.deviceId, change.newAlias);
				deviceState.removeAliasOverride(change.deviceId);
				successCount++;
			}

			// Process Setting Updates
			const settingUpdatesByDevice: Record<string, any[]> = {};
			for (const change of settingChanges) {
				if (!settingUpdatesByDevice[change.deviceId]) settingUpdatesByDevice[change.deviceId] = [];
				if (change.value !== undefined) {
					let type = 'String';
					if (typeof change.value === 'boolean') type = 'Bool';
					else if (typeof change.value === 'number')
						type = change.value % 1 === 0 ? 'Int' : 'Float';

					// Use encodeParamValue logic or similar
					const encodedValue = encodeParamValue({
						key: change.key,
						value: change.value,
						type: type
					});

					settingUpdatesByDevice[change.deviceId].push({
						key: change.key,
						value: String(encodedValue),
						is_compressed: false
					});
				}
			}

			for (const [deviceId, params] of Object.entries(settingUpdatesByDevice)) {
				const response = await v0Client.POST('/settings/{deviceId}', {
					params: {
						path: { deviceId }
					},
					body: params,
					headers: {
						Authorization: `Bearer ${token}`
					}
				});

				if (response.error) {
					throw new Error(
						`Failed to update settings for ${deviceId}: ${response.error.detail || 'Unknown error'}`
					);
				}

				// Clear staged changes for this device
				deviceState.clearChanges(deviceId);
			}

			// Clean up successful setting changes from count
			successCount += settingChanges.length;

			open = false;
			// Force reload to reflect changes strictly
			window.location.reload();
		} catch (e: any) {
			console.error('Failed to save changes:', e);
			error = e.message || 'Failed to save changes';
		} finally {
			saving = false;
		}
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div
			class="w-full max-w-lg overflow-hidden rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl"
		>
			<div class="border-b border-[#334155] bg-[#0f1726] p-6">
				<h3 class="text-xl font-bold text-white">Save Changes</h3>
				<p class="mt-1 text-slate-400">
					You are about to apply {totalChanges} change{totalChanges === 1 ? '' : 's'}.
				</p>
			</div>

			<div class="max-h-[60vh] overflow-y-auto p-6">
				{#if error}
					<div class="mb-6 flex items-start gap-3 rounded-lg bg-red-500/10 p-4 text-red-400">
						<AlertCircle class="mt-0.5 shrink-0" size={18} />
						<div class="text-sm">{error}</div>
					</div>
				{/if}

				<div class="space-y-4">
					{#if aliasChanges.length > 0}
						<div>
							<h4 class="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
								Aliases
							</h4>
							<div class="space-y-2">
								{#each aliasChanges as change}
									<div
										class="flex items-center gap-4 rounded-lg border border-[#334155] bg-[#101a29] p-3"
									>
										<div class="min-w-0 flex-1">
											<div
												class="mb-1 overflow-hidden font-mono text-xs text-ellipsis text-slate-500"
											>
												{change.deviceId}
											</div>
											<div class="flex items-center gap-3">
												<div class="flex-1 truncate text-right text-sm text-slate-400">
													{change.oldAlias}
												</div>
												<ArrowRight class="shrink-0 text-slate-600" size={16} />
												<div class="flex-1 truncate text-sm font-medium text-primary">
													{change.newAlias}
												</div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if settingChanges.length > 0}
						<div>
							<h4 class="mb-2 text-xs font-bold tracking-wider text-slate-500 uppercase">
								Settings
							</h4>
							<div class="space-y-2">
								{#each settingChanges as change}
									<div
										class="flex items-center gap-4 rounded-lg border border-[#334155] bg-[#101a29] p-3"
									>
										<div class="min-w-0 flex-1">
											<div
												class="mb-1 overflow-hidden font-mono text-xs text-ellipsis text-slate-500"
											>
												{change.deviceId}
											</div>
											<div class="flex items-center justify-between gap-3">
												<div class="truncate text-sm font-medium text-white">
													{change.key}
												</div>
												<div class="flex items-center gap-2">
													<span class="text-xs text-slate-500">{String(change.originalValue)}</span>
													<ArrowRight class="shrink-0 text-slate-600" size={14} />
													<span class="text-xs font-bold text-primary">{String(change.value)}</span>
												</div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="flex justify-end gap-3 border-t border-[#334155] bg-[#0f1726] p-6">
				<button
					class="btn text-slate-400 btn-ghost hover:text-white"
					onclick={() => (open = false)}
					disabled={saving}
				>
					Cancel
				</button>
				<button class="btn min-w-[120px] btn-primary" onclick={handleSave} disabled={saving}>
					{#if saving}
						<Loader2 size={18} class="mr-2 animate-spin" />
						Saving...
					{:else}
						Confirm Update
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
