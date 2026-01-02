<script lang="ts">
	import { v0Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { Loader2, ArrowRight, AlertCircle } from 'lucide-svelte';

	let { open = $bindable(false), changes = [] } = $props<{
		open: boolean;
		changes: Array<{
			deviceId: string;
			oldAlias: string;
			newAlias: string;
		}>;
	}>();

	let saving = $state(false);
	let error = $state<string | undefined>(undefined);
	let successCount = $state(0);

	$effect(() => {
		if (open) {
			error = undefined;
			successCount = 0;
		}
	});

	async function handleSave() {
		if (!logtoClient || changes.length === 0) return;

		saving = true;
		error = undefined;
		successCount = 0;

		try {
			const token = await logtoClient.getIdToken();
			if (!token) throw new Error('Not authenticated');

			// Process updates sequentially
			for (const change of changes) {
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

				if ((response as any).error) {
					const err = (response as any).error;
					const errorMsg =
						typeof err === 'object' && err !== null
							? err.detail || 'Unknown error'
							: 'Unknown error';
					throw new Error(`Failed to update alias for ${change.deviceId}: ${errorMsg}`);
				}

				// Update local state immediately for this device
				deviceState.updateAlias(change.deviceId, change.newAlias);
				deviceState.removeAliasOverride(change.deviceId);
				successCount++;
			}

			open = false;
		} catch (e: any) {
			console.error('Failed to update aliases:', e);
			error = e.message || 'Failed to update aliases';
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
					You are about to update the alias for {changes.length} device{changes.length === 1
						? ''
						: 's'}.
				</p>
			</div>

			<div class="max-h-[60vh] overflow-y-auto p-6">
				{#if error}
					<div class="mb-6 flex items-start gap-3 rounded-lg bg-red-500/10 p-4 text-red-400">
						<AlertCircle class="mt-0.5 shrink-0" size={18} />
						<div class="text-sm">{error}</div>
					</div>
				{/if}

				<div class="space-y-3">
					{#each changes as change}
						<div
							class="flex items-center gap-4 rounded-lg border border-[#334155] bg-[#101a29] p-4"
						>
							<div class="min-w-0 flex-1">
								<div class="mb-1 font-mono text-xs text-slate-500">{change.deviceId}</div>
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
						Saving {successCount}/{changes.length}...
					{:else}
						Confirm Update
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
