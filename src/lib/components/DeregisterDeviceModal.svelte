<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';
	import { AlertTriangle, Loader2, Trash2, X, ChevronLeft, ExternalLink } from 'lucide-svelte';
	import { deregisterDevice, removeUserFromDevice } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';

	let {
		open = $bindable(false),
		deviceId,
		alias,
		onDeregistered
	}: {
		open: boolean;
		deviceId: string;
		alias: string;
		pairedAt?: number;
		isOnline?: boolean;
		onDeregistered?: () => void;
	} = $props();

	const CONFIRM_PHRASE = 'permanent deregister';
	const FORUM_BUG_REPORT = 'https://community.sunnypilot.ai/c/bug-reports/8';

	let stage = $state<1 | 2>(1);
	let confirmInput = $state('');
	let checkedPermanent = $state(false);
	let checkedIntend = $state(false);
	let isProcessing = $state(false);
	let error = $state<string | null>(null);
	let fatalError = $state(false);

	function reset() {
		stage = 1;
		confirmInput = '';
		checkedPermanent = false;
		checkedIntend = false;
		isProcessing = false;
		error = null;
		fatalError = false;
	}

	function close() {
		if (isProcessing) return;
		open = false;
		setTimeout(reset, 250);
	}

	function blockPaste(e: Event) {
		e.preventDefault();
	}

	function continueAnyway() {
		stage = 2;
	}

	function backToStage1() {
		if (isProcessing) return;
		stage = 1;
	}

	let canDeregister = $derived(
		checkedPermanent && checkedIntend && confirmInput.trim() === CONFIRM_PHRASE
	);

	async function handleDeregister() {
		if (!canDeregister || isProcessing) return;
		isProcessing = true;
		error = null;
		fatalError = false;

		try {
			const token = await logtoClient?.getIdToken();
			if (!token) throw new Error('Not authenticated');

			try {
				await deregisterDevice(deviceId, token);
			} catch (e) {
				console.error('Deregistration failed:', e);
				fatalError = true;
				error =
					'Deregistration failed. Please contact support before retrying — do not attempt to remove the user manually.';
				isProcessing = false;
				return;
			}

			await removeUserFromDevice(deviceId, 'self', token);

			onDeregistered?.();
			close();
		} catch (e) {
			console.error('User removal failed:', e);
			error =
				'Failed to remove user from device, but the device may have been deregistered. Refresh and check.';
			isProcessing = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) close();
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		use:modalLock
		class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm sm:py-0"
		style="padding-top: max(env(safe-area-inset-top), 1.5rem); padding-bottom: max(env(safe-area-inset-bottom), 1.5rem);"
		role="dialog"
		aria-modal="true"
		aria-labelledby="deregister-modal-title"
		transition:fade={{ duration: 200 }}
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
	>
		<div
			class="relative max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-6 shadow-xl"
			transition:scale={{ start: 0.95, duration: 200, opacity: 0 }}
		>
			<button
				type="button"
				class="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.9] active:bg-[var(--sl-bg-subtle)] disabled:opacity-50 disabled:active:scale-100"
				onclick={close}
				disabled={isProcessing}
				aria-label="Dismiss"
			>
				<X size={16} />
			</button>

			{#if stage === 1}
				<h2
					id="deregister-modal-title"
					class="pr-10 text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
				>
					Before you deregister
				</h2>
				<div
					class="mt-3 flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 dark:bg-red-500/10"
				>
					<AlertTriangle
						size={16}
						class="mt-0.5 shrink-0 text-red-600 dark:text-red-400"
						aria-hidden="true"
					/>
					<p class="text-[0.8125rem] leading-relaxed text-red-700 dark:text-red-300">
						<span class="font-medium">This is destructive and permanent.</span> Deregistering removes
						this device from your account and is irreversible.
					</p>
				</div>
				<p class="mt-4 text-[0.875rem] leading-relaxed text-[var(--sl-text-2)]">
					Most issues — device offline, settings not syncing, login problems — don't require a
					deregister. Reporting a bug on the community forum is almost always the right first step.
				</p>

				<a
					href={FORUM_BUG_REPORT}
					target="_blank"
					rel="noopener"
					class="mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[0.875rem] font-medium text-white transition-all duration-100 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] active:opacity-85"
				>
					<span>Report an issue on the forum</span>
					<ExternalLink size={14} aria-hidden="true" />
				</a>
				<button
					type="button"
					onclick={continueAnyway}
					class="mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg border border-[var(--sl-border)] bg-transparent px-4 text-[0.875rem] font-medium text-[var(--sl-text-2)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.98] active:bg-[var(--sl-bg-subtle)]"
				>
					Continue anyway
				</button>
			{:else}
				<div class="mb-1 flex items-center gap-1">
					<button
						type="button"
						onclick={backToStage1}
						disabled={isProcessing}
						class="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--sl-text-3)] transition-all duration-100 hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.9] active:bg-[var(--sl-bg-subtle)] disabled:opacity-50 disabled:active:scale-100"
						aria-label="Back"
					>
						<ChevronLeft size={16} />
					</button>
					<span class="text-[0.75rem] text-[var(--sl-text-3)]">Step 2 of 2</span>
				</div>
				<h2
					id="deregister-modal-title"
					class="pr-10 text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
				>
					Confirm deregister
				</h2>
				<p class="mt-2 text-[0.8125rem] text-[var(--sl-text-2)]">You're about to deregister:</p>
				<div
					class="mt-2 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/60 px-3 py-2.5"
				>
					<p class="truncate text-[0.9375rem] font-semibold text-[var(--sl-text-1)]">
						{alias || deviceId}
					</p>
					<dl class="mt-1 flex flex-col gap-0.5">
						<div class="flex items-baseline gap-2">
							<dt class="shrink-0 text-[0.6875rem] text-[var(--sl-text-3)]">sunnylink Device ID</dt>
							<dd
								class="min-w-0 flex-1 truncate text-right font-mono text-[0.6875rem] text-[var(--sl-text-2)]"
							>
								{deviceId}
							</dd>
						</div>
					</dl>
				</div>

				<div class="mt-4 space-y-2.5">
					<label
						class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/40 px-3 py-2.5 transition-colors hover:bg-[var(--sl-bg-elevated)]/70"
					>
						<input
							type="checkbox"
							bind:checked={checkedPermanent}
							class="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--sl-border)] text-primary accent-primary focus-visible:outline-2 focus-visible:outline-primary"
						/>
						<span class="text-[0.8125rem] leading-relaxed text-[var(--sl-text-2)]">
							I understand this is <span class="font-medium text-[var(--sl-text-1)]">permanent</span
							> and cannot be undone.
						</span>
					</label>
					<label
						class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/40 px-3 py-2.5 transition-colors hover:bg-[var(--sl-bg-elevated)]/70"
					>
						<input
							type="checkbox"
							bind:checked={checkedIntend}
							class="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[var(--sl-border)] text-primary accent-primary focus-visible:outline-2 focus-visible:outline-primary"
						/>
						<span class="text-[0.8125rem] leading-relaxed text-[var(--sl-text-2)]">
							I want to <span class="font-medium text-[var(--sl-text-1)]">deregister</span> this device
							from my account.
						</span>
					</label>
				</div>

				<div class="mt-4">
					<label for="deregister-confirm" class="block text-[0.8125rem] text-[var(--sl-text-2)]">
						Type <span class="font-mono font-semibold text-[var(--sl-text-1)]"
							>{CONFIRM_PHRASE}</span
						> to confirm:
					</label>
					<input
						id="deregister-confirm"
						type="text"
						bind:value={confirmInput}
						onpaste={blockPaste}
						ondrop={blockPaste}
						autocomplete="off"
						autocapitalize="none"
						autocorrect="off"
						spellcheck="false"
						class="mt-1.5 w-full rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-input)] px-3 py-2 font-mono text-[0.875rem] text-[var(--sl-text-1)] focus:border-red-500 focus-visible:outline-2 focus-visible:outline-red-500"
						placeholder={CONFIRM_PHRASE}
					/>
				</div>

				{#if error}
					<div
						class="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[0.8125rem] text-red-700 dark:text-red-300"
						role="alert"
					>
						{error}
					</div>
				{/if}

				<button
					type="button"
					onclick={handleDeregister}
					disabled={!canDeregister || isProcessing || fatalError}
					class="mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 text-[0.875rem] font-medium text-white transition-all duration-100 hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 active:scale-[0.98] active:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-600/50 disabled:active:scale-100 dark:bg-red-500 dark:hover:bg-red-600"
				>
					{#if isProcessing}
						<Loader2 size={14} class="animate-spin" aria-hidden="true" />
						<span>Deregistering…</span>
					{:else}
						<Trash2 size={14} aria-hidden="true" />
						<span>Deregister device</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}
