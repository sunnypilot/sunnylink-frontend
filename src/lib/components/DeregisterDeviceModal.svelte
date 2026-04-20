<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';
	import { AlertTriangle, Loader2, Trash2, X, ArrowRight, Wifi, WifiOff } from 'lucide-svelte';
	import { deregisterDevice, removeUserFromDevice } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { downloadSettingsBackup } from '$lib/utils/settings';
	import { deviceState } from '$lib/stores/device.svelte';
	import { Download } from 'lucide-svelte';

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

	const CONFIRMATION_PHRASE = 'FACTORY RESET';

	let step = $state(1);
	let confirmationInput = $state('');
	let isProcessing = $state(false);
	let error = $state<string | null>(null);
	let fatalError = $state(false);

	// Checkboxes state
	let checkedUndone = $state(false);
	let checkedFactoryReset = $state(false);

	function reset() {
		step = 1;
		confirmationInput = '';
		isProcessing = false;
		error = null;
		fatalError = false;
		checkedUndone = false;
		checkedFactoryReset = false;
	}

	function close() {
		if (isProcessing) return;
		open = false;
		setTimeout(reset, 300); // Reset after animation
	}

	function handleFirstConfirmation() {
		if (confirmationInput !== CONFIRMATION_PHRASE || !checkedUndone || !checkedFactoryReset) return;
		step = 2;
	}

	function blockPaste(e: Event) {
		e.preventDefault();
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
			class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
			transition:fade={{ duration: 200 }}
			onclick={close}
			aria-label="Close modal"
			disabled={isProcessing}
		></button>

		<!-- Modal Content -->
		<div
			class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-red-500/20 bg-[var(--sl-bg-input)] shadow-2xl"
			transition:scale={{ start: 0.95, duration: 200 }}
		>
			<!-- Header -->
			<div class="border-b border-red-500/10 bg-red-500/5 p-6">
				<div class="flex items-start justify-between">
					<div class="flex items-center gap-3 text-red-600 dark:text-red-400">
						<div class="rounded-full bg-red-500/10 p-2">
							<AlertTriangle size={24} />
						</div>
						<h3 class="text-xl font-bold text-[var(--sl-text-1)]">Deregister Device</h3>
					</div>
					<button
						class="rounded-lg p-2 text-[var(--sl-text-2)] hover:bg-white/5 hover:text-[var(--sl-text-1)] disabled:opacity-50"
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
							<p class="font-bold text-red-600 dark:text-red-400">WARNING: IRREVERSIBLE ACTION</p>
							<p class="mt-2 text-sm text-[var(--sl-text-2)]">
								Deregistration <span class="font-bold text-[var(--sl-text-1)]">must only be done after performing a full factory reset</span> on
								your device. Deregistering without a factory reset will leave your device in a
								broken state that cannot be fixed remotely.
							</p>
							<p class="mt-2 text-sm text-[var(--sl-text-2)]">
								All historical data and backups associated with this device ID will be
								permanently inaccessible.
								<span class="font-bold text-[var(--sl-text-1)]">This action cannot be undone.</span>
							</p>
							<p class="mt-2 text-sm font-semibold text-red-600 dark:text-red-400">
								If you are trying to fix a problem with your device, deregistering is NOT the
								solution. Please ask for help in the community first.
							</p>
						</div>

						<!-- Backup Recommendation -->
						<div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
							<div class="flex items-start gap-3">
								<div class="rounded-full bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
									<Download size={20} />
								</div>
								<div>
									<h4 class="font-bold text-blue-700 dark:text-blue-400">
										Recommended: Backup Settings
									</h4>
									<p class="mt-1 text-sm text-[var(--sl-text-2)]">
										Before deregistering, download a backup of your settings so you can restore them
										to a new device later.
									</p>
									<button
										class="btn mt-3 border-blue-500/30 text-blue-400 btn-outline btn-sm hover:border-blue-500 hover:bg-blue-500 hover:text-[var(--sl-text-1)]"
										onclick={() => {
											if (deviceState.deviceValues[deviceId]) {
												downloadSettingsBackup(deviceId, deviceState.deviceValues[deviceId]);
											}
										}}
									>
										<Download size={14} class="mr-2" />
										Download Backup
									</button>
								</div>
							</div>
						</div>

						<!-- Checkboxes -->
						<div class="space-y-3">
							<label class="group flex cursor-pointer items-start gap-3">
								<input
									type="checkbox"
									bind:checked={checkedUndone}
									class="checkbox h-6 w-6 rounded-md border-[var(--sl-border)] bg-transparent checkbox-error transition-all hover:border-red-400"
								/>
								<span
									class="pt-0.5 text-sm text-[var(--sl-text-2)] transition-colors group-hover:text-[var(--sl-text-1)]"
								>
									I understand this action <span class="font-bold text-[var(--sl-text-1)]"
										>cannot be undone</span
									> and is <span class="font-bold text-[var(--sl-text-1)]">NOT a troubleshooting step</span>.
								</span>
							</label>
							<label class="group flex cursor-pointer items-start gap-3">
								<input
									type="checkbox"
									bind:checked={checkedFactoryReset}
									class="checkbox h-6 w-6 rounded-md border-[var(--sl-border)] bg-transparent checkbox-error transition-all hover:border-red-400"
								/>
								<span
									class="pt-0.5 text-sm text-[var(--sl-text-2)] transition-colors group-hover:text-[var(--sl-text-1)]"
								>
									I have already performed a <span class="font-bold text-[var(--sl-text-1)]">full factory reset</span> on this device.
								</span>
							</label>
						</div>

						<div class="space-y-2 pt-2">
							<label for="confirmation" class="text-sm font-medium text-[var(--sl-text-2)]">
								Type <span class="font-mono font-bold text-red-600 dark:text-red-400">{CONFIRMATION_PHRASE}</span> to confirm:
							</label>

							<input
								id="confirmation"
								type="text"
								bind:value={confirmationInput}
								onpaste={blockPaste}
								ondrop={blockPaste}
								class="input w-full border-[var(--sl-border)] bg-[var(--sl-bg-input)] text-[var(--sl-text-1)] placeholder-[var(--sl-text-3)] focus:border-red-500 focus:outline-none"
								placeholder={CONFIRMATION_PHRASE}
								autocomplete="off"
								spellcheck="false"
							/>
						</div>

						<div class="flex items-center justify-end gap-3 pt-2">
							<button
								class="btn text-[var(--sl-text-2)] btn-ghost hover:text-[var(--sl-text-1)]"
								onclick={close}
							>
								Cancel
							</button>
							<button
								class="btn border-none bg-red-600 text-[var(--sl-text-1)] hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={confirmationInput !== CONFIRMATION_PHRASE || !checkedUndone || !checkedFactoryReset}
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
							<p class="text-lg font-medium text-[var(--sl-text-1)]">
								Please double check you are deleting the correct device:
							</p>

							<div
								class="space-y-3 rounded-xl border border-[var(--sl-border)]/50 bg-[var(--sl-bg-surface)]/50 p-4"
							>
								{#if alias && alias !== deviceId}
									<div class="flex flex-col gap-1 border-b border-[var(--sl-border)]/50 pb-2">
										<span class="text-xs font-bold tracking-wider text-[var(--sl-text-3)] uppercase"
											>Device Alias</span
										>
										<span class="text-2xl font-bold text-[var(--sl-text-1)]">{alias}</span>
									</div>
								{/if}

								<div class="flex items-center justify-between">
									<span class="text-[var(--sl-text-2)]">Sunnylink ID</span>
									<span
										class="rounded bg-[var(--sl-bg-input)] px-3 py-1.5 font-mono text-[var(--sl-text-1)]"
										>{deviceId}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-[var(--sl-text-2)]">Paired Date</span>
									<span class="text-[var(--sl-text-1)]">{formatDate(pairedAt)}</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-[var(--sl-text-2)]">Status</span>
									{#if isOnline}
										<span
											class="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400"
										>
											<Wifi size={14} /> Online
										</span>
									{:else}
										<span class="flex items-center gap-1.5 font-medium text-[var(--sl-text-2)]">
											<WifiOff size={14} /> Offline
										</span>
									{/if}
								</div>
							</div>
						</div>

						{#if error}
							<div
								class="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm font-medium text-red-600 dark:text-red-400"
							>
								{error}
							</div>
						{/if}

						<div class="flex items-center justify-end gap-3 pt-2">
							<button
								class="btn text-[var(--sl-text-2)] btn-ghost hover:text-[var(--sl-text-1)] disabled:opacity-50"
								onclick={() => (step = 1)}
								disabled={isProcessing}
							>
								Back
							</button>
							<button
								class="btn border-none bg-red-600 text-[var(--sl-text-1)] hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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
