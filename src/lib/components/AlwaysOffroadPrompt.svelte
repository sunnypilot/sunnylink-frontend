<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { AlertTriangle } from 'lucide-svelte';
	import ForceOffroadModal from '$lib/components/ForceOffroadModal.svelte';

	let modalOpen = $state(false);

	let deviceId = $derived(deviceState.selectedDeviceId);
	let offroadStatus = $derived(deviceId ? deviceState.offroadStatuses[deviceId] : undefined);
	let onlineStatus = $derived(deviceId ? deviceState.onlineStatuses[deviceId] : undefined);

	// Show the prompt only when we have a live reading that the car is actively driving
	// (isOffroad === false, not undefined) and no forceOffroad override already active.
	// Hiding when status is 'loading'/'offline'/undefined avoids spurious banners on stale data.
	let visible = $derived(
		onlineStatus === 'online' &&
			offroadStatus?.isOffroad === false &&
			offroadStatus?.forceOffroad !== true
	);
</script>

{#if visible}
	<div
		role="status"
		aria-live="polite"
		class="mx-auto mb-4 flex w-full max-w-2xl items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 xl:max-w-3xl"
	>
		<AlertTriangle
			size={18}
			class="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
			aria-hidden="true"
		/>
		<div class="min-w-0 flex-1">
			<p class="text-[0.875rem] font-medium text-[var(--sl-text-1)]">Car is Onroad</p>
			<p class="mt-0.5 text-[0.75rem] leading-snug text-[var(--sl-text-2)]">
				Some settings require Always Offroad Mode to take effect. Switch the device to Always
				Offroad Mode if you need to edit them now.
			</p>
		</div>
		<button
			type="button"
			class="shrink-0 rounded-md border border-amber-500/40 bg-[var(--sl-bg-surface)] px-2.5 py-1 text-[0.75rem] font-medium text-amber-700 transition-all duration-100 hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-amber-500 active:scale-[0.96] active:bg-amber-500/30 dark:text-amber-400"
			onclick={() => (modalOpen = true)}
		>
			Enable Always Offroad Mode
		</button>
	</div>
{/if}

<ForceOffroadModal bind:open={modalOpen} onSuccess={() => (modalOpen = false)} />
