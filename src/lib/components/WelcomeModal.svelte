<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { deviceState } from '$lib/stores/device.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';
	import { ArrowRight } from 'lucide-svelte';

	// Two onboarding variants, shown at distinct moments:
	//
	// A — general welcome. Fires on the user's first dashboard visit regardless
	//     of device state. CTA routes to the devices page when no device is
	//     selected; otherwise it just dismisses.
	// B — new-schema unlock. Fires the first time a device with new schema is
	//     the selected device. Gated behind A having been dismissed, so a
	//     brand-new user with a new-schema device sees A now and B on a later
	//     visit — two distinct moments, not two stacked modals.
	//
	// Dismiss state is localStorage, per browser. Matches industry norm for
	// onboarding (Linear/Vercel/Stripe). Backend persistence would be overkill.
	const DISMISS_KEY_GENERAL = 'sunnylink_welcome_general_dismissed_v1';
	const DISMISS_KEY_NEW_SCHEMA = 'sunnylink_welcome_new_schema_dismissed_v1';

	let dismissedGeneral = $state(false);
	let dismissedNewSchema = $state(false);
	let hydrated = $state(false);

	function readDismissed(key: string): boolean {
		try {
			return localStorage.getItem(key) === '1';
		} catch {
			return false;
		}
	}

	function writeDismissed(key: string) {
		try {
			localStorage.setItem(key, '1');
		} catch {
			/* quota */
		}
	}

	onMount(() => {
		dismissedGeneral = readDismissed(DISMISS_KEY_GENERAL);
		dismissedNewSchema = readDismissed(DISMISS_KEY_NEW_SCHEMA);
		hydrated = true;
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});

	// Selected device has new schema = schemaUnavailable is explicitly false.
	// `undefined` means schema not yet loaded; wait for confirmation either way.
	const selectedHasNewSchema = $derived(
		!!deviceState.selectedDeviceId &&
			schemaState.schemaUnavailable[deviceState.selectedDeviceId] === false
	);

	const showGeneral = $derived(hydrated && !dismissedGeneral);
	const showNewSchema = $derived(
		hydrated && dismissedGeneral && !dismissedNewSchema && selectedHasNewSchema
	);
	const visible = $derived(showGeneral || showNewSchema);

	function onGeneralGetStarted() {
		writeDismissed(DISMISS_KEY_GENERAL);
		dismissedGeneral = true;
		if (!deviceState.selectedDeviceId) {
			goto('/dashboard/devices');
		}
	}

	function onGeneralClose() {
		writeDismissed(DISMISS_KEY_GENERAL);
		dismissedGeneral = true;
	}

	function onNewSchemaGotIt() {
		writeDismissed(DISMISS_KEY_NEW_SCHEMA);
		dismissedNewSchema = true;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !visible) return;
		if (showGeneral) onGeneralClose();
		else if (showNewSchema) onNewSchemaGotIt();
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target !== e.currentTarget) return;
		if (showGeneral) onGeneralClose();
		else if (showNewSchema) onNewSchemaGotIt();
	}
</script>

{#if visible}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		use:portal
		use:modalLock
		class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="welcome-modal-title"
		transition:fade={{ duration: 150 }}
		onclick={onBackdropClick}
	>
		<div
			class="relative w-full max-w-md rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-6 shadow-xl"
			transition:fly={{ y: 8, duration: 150, easing: cubicOut, opacity: 0 }}
		>
			{#if showGeneral}
				<h2
					id="welcome-modal-title"
					class="text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
				>
					Welcome to the new sunnylink
				</h2>
				<p class="mt-2 text-[0.875rem] leading-relaxed text-[var(--sl-text-2)]">
					A redesigned dashboard and faster device management.
				</p>

				<button
					type="button"
					onclick={onGeneralGetStarted}
					class="mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[0.875rem] font-medium text-white transition-all duration-100 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] active:bg-primary/80"
				>
					<span>Get started</span>
					<ArrowRight size={14} aria-hidden="true" />
				</button>
			{:else if showNewSchema}
				<h2
					id="welcome-modal-title"
					class="text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
				>
					Unlocked: new sunnylink features
				</h2>
				<div class="mt-4">
					<span
						class="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-[1px] text-[0.6875rem] font-semibold tracking-wide text-primary uppercase"
					>
						New
					</span>
					<p class="mt-2 text-[0.875rem] leading-relaxed text-[var(--sl-text-2)]">
						Smart settings — only what applies to your car.
					</p>
				</div>

				<button
					type="button"
					onclick={onNewSchemaGotIt}
					class="mt-5 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[0.875rem] font-medium text-white transition-all duration-100 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] active:bg-primary/80"
				>
					<span>Got it</span>
				</button>
			{/if}
		</div>
	</div>
{/if}
