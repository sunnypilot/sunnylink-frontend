<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { X, RectangleHorizontal, ArrowLeft } from 'lucide-svelte';

	let { open = $bindable(false), deviceType = $bindable(null) } = $props<{
		open: boolean;
		deviceType?: 'c3' | 'c4' | null;
	}>();

	let step = $state(1); // 1: Select Device, 2: Instructions
	let selectedDeviceType = $state<'c3' | 'c4' | null>(null);

	$effect(() => {
		if (open && deviceType) {
			selectedDeviceType = deviceType;
			goToStep(2);
		} else if (open && !selectedDeviceType) {
			goToStep(1);
		}
	});

	function close() {
		open = false;
		// Reset state after exit animation completes
		setTimeout(() => {
			step = 1;
			selectedDeviceType = null;
			deviceType = null;
			stepDirection = 'forward';
		}, 300);
	}

	function selectDevice(type: 'c3' | 'c4') {
		selectedDeviceType = type;
		goToStep(2);
	}

	function back() {
		if (deviceType) {
			deviceType = null;
		}
		goToStep(1);
		selectedDeviceType = null;
	}

	// ── Scroll lock ─────────────────────────────────────────────────────
	let savedScrollY = 0;

	$effect(() => {
		if (open) {
			savedScrollY = window.scrollY;
			document.body.style.position = 'fixed';
			document.body.style.top = `-${savedScrollY}px`;
			document.body.style.width = '100%';
			document.body.style.overflow = 'hidden';
		}
		return () => {
			document.body.style.position = '';
			document.body.style.top = '';
			document.body.style.width = '';
			document.body.style.overflow = '';
			window.scrollTo(0, savedScrollY);
		};
	});

	// ── M3 emphasized easing ────────────────────────────────────────────
	function emphasizedDecelerate(t: number): number {
		return 1 - Math.pow(1 - t, 3);
	}

	function emphasizedAccelerate(t: number): number {
		return t * t * t;
	}

	const isMobilePairing = typeof window !== 'undefined' && window.innerWidth < 640;

	// ── Step transition direction ────────────────────────────────────────
	let stepDirection: 'forward' | 'back' = $state('forward');

	function goToStep(newStep: number) {
		stepDirection = newStep > step ? 'forward' : 'back';
		step = newStep;
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-6"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/60 backdrop-blur-sm sm:bg-black/80"
			in:fade={{ duration: 400, easing: cubicOut }}
			out:fade={{ duration: 250 }}
			onclick={close}
			aria-label="Close modal"
		></button>

		<!-- Content -->
		<div
			class="relative flex h-full w-full flex-col overflow-hidden bg-[var(--sl-bg-surface)] sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:max-w-lg sm:rounded-xl sm:border sm:border-[var(--sl-border)] sm:shadow-2xl"
			in:fly={{ y: isMobilePairing ? 800 : 40, duration: isMobilePairing ? 450 : 350, easing: emphasizedDecelerate }}
			out:fly={{ y: isMobilePairing ? 800 : 40, duration: isMobilePairing ? 250 : 200, easing: emphasizedAccelerate }}
		>
			<!-- Header -->
			<div class="shrink-0 border-b border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 px-4 py-3 sm:px-5 sm:py-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						{#if step === 2}
							<button
								class="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sl-text-2)] hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
								onclick={back}
								title="Back"
							>
								<ArrowLeft size={20} />
							</button>
						{/if}
						<h3 class="text-lg font-semibold text-[var(--sl-text-1)]">Pair New Device</h3>
					</div>
					<button
						class="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--sl-text-2)] hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
						onclick={close}
						aria-label="Close"
					>
						<X size={20} />
					</button>
				</div>
			</div>

			<div class="flex-1 overflow-hidden p-4 sm:p-5" style="display: grid; min-height: 240px; align-content: start;">
				{#key step}
				<div
					style="grid-area: 1 / 1;"
					in:fly={{ x: stepDirection === 'forward' ? 60 : -60, duration: 200, delay: 120 }}
					out:fly={{ x: stepDirection === 'forward' ? -30 : 30, duration: 120 }}
				>
				{#if step === 1}
					<div class="space-y-4">
						<p class="text-sm text-[var(--sl-text-2)]">
							Select your comma device model to see pairing instructions.
						</p>

						<div class="grid gap-4 sm:grid-cols-2">
							<!-- comma four -->
							<button
								class="group flex flex-col items-center justify-center gap-4 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 p-4 transition-all duration-150 hover:border-primary/50 hover:bg-[var(--sl-bg-elevated)] active:scale-[0.98] active:opacity-70"
								onclick={() => selectDevice('c4')}
							>
								<div
									class="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--sl-bg-surface)] text-[var(--sl-text-2)] transition-colors group-hover:bg-primary/10 group-hover:text-primary"
								>
									<RectangleHorizontal size={28} />
								</div>
								<div class="text-center">
									<h4 class="font-bold text-[var(--sl-text-1)]">comma 4</h4>
									<p class="text-xs text-[var(--sl-text-3)]">Next generation</p>
								</div>
							</button>

							<!-- comma 3X -->
							<button
								class="group flex flex-col items-center justify-center gap-4 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/50 p-4 transition-all duration-150 hover:border-primary/50 hover:bg-[var(--sl-bg-elevated)] active:scale-[0.98] active:opacity-70"
								onclick={() => selectDevice('c3')}
							>
								<div
									class="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--sl-bg-surface)] text-[var(--sl-text-2)] transition-colors group-hover:bg-primary/10 group-hover:text-primary"
								>
									<RectangleHorizontal size={40} />
								</div>
								<div class="text-center">
									<h4 class="font-bold text-[var(--sl-text-1)]">comma 3 / 3X</h4>
									<p class="text-xs text-[var(--sl-text-3)]">Standard generation</p>
								</div>
							</button>
						</div>
					</div>
				{:else if step === 2}
					<div class="space-y-6">
						<!-- GIF Display -->
						<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-black">
							{#if selectedDeviceType === 'c3'}
								<!-- svelte-ignore a11y_img_redundant_alt -->
								<img
									src="/pair_c3.gif"
									alt="Pairing instructions for comma 3"
									class="h-auto w-full object-contain"
								/>
							{:else if selectedDeviceType === 'c4'}
								<!-- svelte-ignore a11y_img_redundant_alt -->
								<img
									src="/pair_c4.gif"
									alt="Pairing instructions for comma four"
									class="h-auto w-full object-contain"
								/>
							{/if}
						</div>

						<div class="rounded-xl bg-blue-500/10 p-4">
							<ol class="list-inside list-decimal space-y-2 text-sm text-[var(--sl-text-2)]">
								<li>Note: <strong>Wi-Fi</strong> is NOT required for pairing.</li>
								<li>
									Go to <strong class="text-[var(--sl-text-1)]">Settings &gt; sunnylink</strong> on your device.
								</li>
								<li>
									Tap on
									{#if selectedDeviceType === 'c4'}
										<strong class="text-[var(--sl-text-1)]">Pair</strong>
									{:else}
										<strong class="text-[var(--sl-text-1)]">Not Paired</strong>
									{/if}
									(or <strong class="text-[var(--sl-text-1)]">Paired</strong>
									if adding another user).
								</li>
								<li>
									Scan the <strong>QR code</strong> shown on your device screen.
								</li>
							</ol>
						</div>
					</div>
				{/if}
				</div>
				{/key}
			</div>
		</div>
	</div>
{/if}
