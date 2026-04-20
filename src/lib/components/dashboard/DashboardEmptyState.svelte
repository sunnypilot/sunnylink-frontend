<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { Plus } from 'lucide-svelte';
	import pairDeviceIllustration from '$lib/assets/illustrations/pair-device.svg?raw';

	let helpOpen = $state(false);
</script>

<section
	class="mx-auto flex max-w-md flex-col items-center px-4 py-10 text-center"
	aria-labelledby="empty-h1"
>
	<div
		class="mb-6 h-32 w-32 text-primary"
		role="img"
		aria-label="Illustration of a sunnypilot device with pairing signals around it"
	>
		{@html pairDeviceIllustration}
	</div>

	<h1
		id="empty-h1"
		tabindex="-1"
		class="text-[1.5rem] leading-tight font-semibold tracking-[-0.01em] text-[var(--sl-text-1)]"
	>
		Pair your first device
	</h1>
	<p class="mt-2 text-[0.9375rem] leading-relaxed text-[var(--sl-text-2)]">
		Manage sunnypilot settings, push models, and keep your build in sync from
		anywhere.
	</p>

	<ol
		class="mt-6 flex w-full flex-col gap-3 text-left text-[0.875rem] text-[var(--sl-text-2)]"
	>
		<li class="flex items-start gap-3">
			<span
				class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sl-bg-elevated)] text-[0.75rem] font-semibold text-[var(--sl-text-1)]"
				>1</span
			>
			<span>Open sunnypilot on your device and go to <strong>Account</strong>.</span>
		</li>
		<li class="flex items-start gap-3">
			<span
				class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sl-bg-elevated)] text-[0.75rem] font-semibold text-[var(--sl-text-1)]"
				>2</span
			>
			<span>Copy the pairing code shown under <strong>Link sunnylink</strong>.</span>
		</li>
		<li class="flex items-start gap-3">
			<span
				class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sl-bg-elevated)] text-[0.75rem] font-semibold text-[var(--sl-text-1)]"
				>3</span
			>
			<span>Paste it below and confirm.</span>
		</li>
	</ol>

	<button
		class="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[0.9375rem] font-semibold text-[var(--sl-bg-page)] transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
		type="button"
		onclick={() => deviceState.openPairingModal()}
	>
		<Plus size={16} aria-hidden="true" />
		Pair Device
	</button>

	<button
		type="button"
		class="mt-3 text-[0.8125rem] text-[var(--sl-text-3)] underline decoration-[var(--sl-text-3)]/30 underline-offset-2 hover:text-[var(--sl-text-2)] hover:decoration-[var(--sl-text-2)]/50"
		onclick={() => (helpOpen = !helpOpen)}
		aria-expanded={helpOpen}
		aria-controls="empty-help"
	>
		What is pairing?
	</button>

	{#if helpOpen}
		<p
			id="empty-help"
			class="mt-3 max-w-[22rem] text-[0.8125rem] leading-relaxed text-[var(--sl-text-2)]"
		>
			Pairing links your sunnypilot device to this account over sunnylink so
			you can remotely view its status, tweak settings, and push model
			bundles. You can unpair anytime from your device's Account screen or
			here under My Devices.
		</p>
	{/if}
</section>
