<script lang="ts">
	import { Shield, Info, Wifi } from 'lucide-svelte';
	import { preferences } from '$lib/stores/preferences.svelte';

	let { open = $bindable(false) } = $props<{
		open: boolean;
	}>();

	let dontRemind = $state(false);

	function handleClose() {
		if (dontRemind) {
			preferences.showDeviceOnlineHelp = false;
		}
		open = false;
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div
			class="w-full max-w-lg overflow-hidden rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl"
		>
			<div class="border-b border-[#334155] bg-[#0f1726] p-6">
				<div class="flex items-center gap-3">
					<div class="rounded-full bg-primary/10 p-2 text-primary">
						<Wifi size={24} />
					</div>
					<h3 class="text-xl font-bold text-white">Device Connection Required</h3>
				</div>
			</div>

			<div class="space-y-4 p-6">
				<p class="text-slate-300">To configure settings, your device must be online. Here's why:</p>

				<div class="rounded-lg border border-[#334155] bg-[#0f1726] p-4">
					<div class="flex gap-3">
						<Shield class="shrink-0 text-primary" size={20} />
						<div>
							<h4 class="mb-1 font-medium text-white">Privacy First</h4>
							<p class="text-sm text-slate-400">
								We do <strong>not</strong> store your data on our servers. We require a direct connection
								to your device to fetch its current configuration.
							</p>
						</div>
					</div>
				</div>

				<div class="rounded-lg border border-[#334155] bg-[#0f1726] p-4">
					<div class="flex gap-3">
						<Info class="shrink-0 text-primary" size={20} />
						<div>
							<h4 class="mb-1 font-medium text-white">Encrypted Backups</h4>
							<p class="text-sm text-slate-400">
								While we store backups, they are encrypted with your device's private key. Only
								your device is able to decrypt them locally.
							</p>
						</div>
					</div>
				</div>
			</div>

			<div
				class="flex flex-col gap-4 border-t border-[#334155] bg-[#0f1726] p-6 sm:flex-row sm:items-center sm:justify-between"
			>
				<label class="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						class="checkbox border-slate-500 checkbox-sm checkbox-primary"
						bind:checked={dontRemind}
					/>
					<span class="text-sm text-slate-400">Don't remind me again on this browser</span>
				</label>

				<button class="btn min-w-[100px] btn-primary" onclick={handleClose}> Got it </button>
			</div>
		</div>
	</div>
{/if}
