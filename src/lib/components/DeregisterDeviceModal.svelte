<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { AlertTriangle, Loader2, Trash2, X, ArrowRight, Wifi, WifiOff } from 'lucide-svelte';
	import { deregisterDevice, removeUserFromDevice } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';

	let {
		open = $bindable(false),
		deviceId,
		alias,
		pairedAt,
		isOnline,
		onDeregistered
	} = $props<{
		open: boolean;
		deviceId: string;
		alias: string;
		pairedAt: number;
		isOnline: boolean;
		onDeregistered?: () => void;
	}>();

	let step = $state(1);
	let confirmationInput = $state('');
	let isProcessing = $state(false);
	let error = $state<string | null>(null);
	let fatalError = $state(false);

	// Checkboxes state
	let checkedUndone = $state(false);
	let checkedReason = $state(false);

	// Copy state
	let copied = $state(false);

	function reset() {
		step = 1;
		confirmationInput = '';
		isProcessing = false;
		error = null;
		fatalError = false;
		checkedUndone = false;
		checkedReason = false;
		copied = false;
	}

	function close() {
		if (isProcessing) return;
		open = false;
		setTimeout(reset, 300); // Reset after animation
	}

	function handleFirstConfirmation() {
		if (confirmationInput !== deviceId || !checkedUndone || !checkedReason) return;
		step = 2;
	}

	async function handleFinalDeregister() {
		isProcessing = true;
		error = null;
		fatalError = false;

		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');

			// Step 1: Deregister Device
			// This is the irreversible action. We MUST do this first.
			try {
				await deregisterDevice(deviceId, token);
			} catch (e) {
				console.error('Deregistration failed:', e);
				// CRITICAL: If this fails, we must NOT proceed to remove the user.
				// The user needs to contact support.
				fatalError = true;
				error =
					'Deregistration failed. Please contact support immediately. Do NOT attempt to remove the user manually.';
				isProcessing = false;
				return;
			}

			// Step 2: Remove User from Device
			// Only proceed if step 1 was successful
			await removeUserFromDevice(deviceId, 'self', token);

			if (onDeregistered) {
				onDeregistered();
			}
			close();
		} catch (e) {
			console.error('User removal failed:', e);
			error =
				'Failed to remove user from device, but device may have been deregistered. Please refresh and check.';
			isProcessing = false;
		}
	}

	function formatDate(timestamp: number) {
		return new Date(timestamp * 1000).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function copyId() {
		navigator.clipboard.writeText(deviceId);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
			transition:fade={{ duration: 200 }}
			onclick={close}
			aria-label="Close modal"
			disabled={isProcessing}
		></button>

		<!-- Modal Content -->
		<div
			class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-red-500/20 bg-[#0f1726] shadow-2xl"
			transition:scale={{ start: 0.95, duration: 200 }}
		>
			<!-- Header -->
			<div class="border-b border-red-500/10 bg-red-500/5 p-6">
				<div class="flex items-start justify-between">
					<div class="flex items-center gap-3 text-red-500">
						<div class="rounded-full bg-red-500/10 p-2">
							<AlertTriangle size={24} />
						</div>
						<h3 class="text-xl font-bold text-white">Deregister Device</h3>
					</div>
					<button
						class="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
						onclick={close}
						disabled={isProcessing}
					>
						<X size={20} />
					</button>
				</div>
			</div>

			<!-- Body -->
			<div class="p-6 sm:p-8">
				{#if step === 1}
					<div class="space-y-6">
						<div class="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
							<p class="font-bold text-red-400">WARNING: IRREVERSIBLE ACTION</p>
							<p class="mt-2 text-sm text-slate-300">
								You are about to permanently deregister this device.
								<span class="font-bold text-white"
									>All historical data and backups associated with this device ID will be
									permanently inaccessible.</span
								>
							</p>
							<p class="mt-2 text-sm text-slate-300">
								This action cannot be undone. You should only do this if you are selling or
								returning your device.
							</p>
						</div>

						<!-- Checkboxes -->
						<div class="space-y-3">
							<label class="group flex cursor-pointer items-start gap-3">
								<input
									type="checkbox"
									bind:checked={checkedUndone}
									class="checkbox rounded-md border-slate-500 bg-transparent checkbox-error transition-all hover:border-red-400"
								/>
								<span
									class="pt-0.5 text-sm text-slate-300 transition-colors group-hover:text-white"
								>
									I understand this action <span class="font-bold text-white">cannot be undone</span
									>.
								</span>
							</label>
							<label class="group flex cursor-pointer items-start gap-3">
								<input
									type="checkbox"
									bind:checked={checkedReason}
									class="checkbox rounded-md border-slate-500 bg-transparent checkbox-error transition-all hover:border-red-400"
								/>
								<span
									class="pt-0.5 text-sm text-slate-300 transition-colors group-hover:text-white"
								>
									I am going to gift, sell, or return this device.
								</span>
							</label>
						</div>

						<div class="space-y-2 pt-2">
							<label for="confirmation" class="text-sm font-medium text-slate-400">
								Type the Sunnylink ID to confirm:
							</label>

							<!-- Copyable ID -->
							<button
								class="group mb-2 flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-3 transition-all hover:border-slate-600 hover:bg-slate-800"
								onclick={copyId}
								title="Click to copy ID"
							>
								<span class="font-mono font-bold tracking-wide text-white">{deviceId}</span>
								<span
									class="rounded bg-slate-700 px-2 py-1 text-xs font-medium text-slate-300 transition-colors group-hover:bg-slate-600 group-hover:text-white"
								>
									{copied ? 'Copied!' : 'Click to Copy'}
								</span>
							</button>

							<input
								id="confirmation"
								type="text"
								bind:value={confirmationInput}
								class="input w-full border-slate-700 bg-slate-900 text-white placeholder-slate-600 focus:border-red-500 focus:outline-none"
								placeholder={deviceId}
								autocomplete="off"
							/>
						</div>

						<div class="flex items-center justify-end gap-3 pt-2">
							<button class="btn text-slate-400 btn-ghost hover:text-white" onclick={close}>
								Cancel
							</button>
							<button
								class="btn border-none bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={confirmationInput !== deviceId || !checkedUndone || !checkedReason}
								onclick={handleFirstConfirmation}
							>
								Next
								<ArrowRight size={18} class="ml-2" />
							</button>
						</div>
					</div>
				{:else if step === 2}
					<div class="space-y-6">
						<div class="space-y-4">
							<p class="text-lg font-medium text-white">
								Please double check you are deleting the correct device:
							</p>

							<div class="space-y-3 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
								{#if alias && alias !== deviceId}
									<div class="flex flex-col gap-1 border-b border-slate-700/50 pb-2">
										<span class="text-xs font-bold tracking-wider text-slate-500 uppercase"
											>Device Alias</span
										>
										<span class="text-2xl font-bold text-white">{alias}</span>
									</div>
								{/if}

								<div class="flex items-center justify-between">
									<span class="text-slate-400">Sunnylink ID</span>
									<span class="rounded bg-slate-900/50 px-2 py-1 font-mono text-white"
										>{deviceId}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-400">Paired Date</span>
									<span class="text-white">{formatDate(pairedAt)}</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-slate-400">Status</span>
									{#if isOnline}
										<span class="flex items-center gap-1.5 font-medium text-emerald-400">
											<Wifi size={14} /> Online
										</span>
									{:else}
										<span class="flex items-center gap-1.5 font-medium text-slate-400">
											<WifiOff size={14} /> Offline
										</span>
									{/if}
								</div>
							</div>
						</div>

						{#if error}
							<div
								class="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm font-medium text-red-400"
							>
								{error}
							</div>
						{/if}

						<div class="flex items-center justify-end gap-3 pt-2">
							<button
								class="btn text-slate-400 btn-ghost hover:text-white disabled:opacity-50"
								onclick={() => (step = 1)}
								disabled={isProcessing}
							>
								Back
							</button>
							<button
								class="btn border-none bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={isProcessing || fatalError}
								onclick={handleFinalDeregister}
							>
								{#if isProcessing}
									<Loader2 size={18} class="mr-2 animate-spin" />
									Processing...
								{:else}
									<Trash2 size={18} class="mr-2" />
									Yes, Deregister Permanently
								{/if}
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
