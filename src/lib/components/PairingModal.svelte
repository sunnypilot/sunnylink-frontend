<script lang="ts">
	import { fade, scale } from 'svelte/transition';
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
			step = 2;
		} else if (open && !selectedDeviceType) {
			step = 1;
		}
	});

	function close() {
		open = false;
		// Reset state after transition
		setTimeout(() => {
			step = 1;
			selectedDeviceType = null;
			deviceType = null;
		}, 300);
	}

	function selectDevice(type: 'c3' | 'c4') {
		selectedDeviceType = type;
		step = 2;
	}

	function back() {
		if (deviceType) {
			// If we opened with a specific device type, back closes or resets?
			// User might want to switch devices. Let's allow effective "back" to selection.
			deviceType = null;
		}
		step = 1;
		selectedDeviceType = null;
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
		></button>

		<!-- Content -->
		<div
			class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#334155] bg-[#0f1726] shadow-2xl"
			transition:scale={{ start: 0.95, duration: 200 }}
		>
			<!-- Header -->
			<div class="border-b border-[#334155] bg-[#1e293b]/50 p-6">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						{#if step === 2}
							<button
								class="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white"
								onclick={back}
								title="Back"
							>
								<ArrowLeft size={20} />
							</button>
						{/if}
						<h3 class="text-xl font-bold text-white">Pair New Device</h3>
					</div>
					<button
						class="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
						onclick={close}
						aria-label="Close"
					>
						<X size={20} />
					</button>
				</div>
			</div>

			<div class="p-6">
				{#if step === 1}
					<div class="space-y-4">
						<p class="text-sm text-slate-400">
							Select your comma device model to see pairing instructions.
						</p>

						<div class="grid gap-4 sm:grid-cols-2">
							<!-- Comma 3/3X -->
							<button
								class="group flex flex-col items-center justify-center gap-4 rounded-xl border border-[#334155] bg-[#1e293b]/50 p-6 transition-all hover:border-primary/50 hover:bg-[#1e293b]"
								onclick={() => selectDevice('c3')}
							>
								<div
									class="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-slate-400 transition-colors group-hover:bg-primary/10 group-hover:text-primary"
								>
									<RectangleHorizontal size={40} />
								</div>
								<div class="text-center">
									<h4 class="font-bold text-white">comma 3 / 3X</h4>
									<p class="text-xs text-slate-500">Standard generation</p>
								</div>
							</button>

							<!-- Comma 4 -->
							<button
								class="group flex flex-col items-center justify-center gap-4 rounded-xl border border-[#334155] bg-[#1e293b]/50 p-6 transition-all hover:border-primary/50 hover:bg-[#1e293b]"
								onclick={() => selectDevice('c4')}
							>
								<div
									class="flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 text-slate-400 transition-colors group-hover:bg-primary/10 group-hover:text-primary"
								>
									<RectangleHorizontal size={28} />
								</div>
								<div class="text-center">
									<h4 class="font-bold text-white">comma 4</h4>
									<p class="text-xs text-slate-500">Next generation</p>
								</div>
							</button>
						</div>
					</div>
				{:else if step === 2}
					<div class="space-y-6">
						<!-- GIF Display -->
						<div class="overflow-hidden rounded-xl border border-[#334155] bg-black">
							{#if selectedDeviceType === 'c3'}
								<!-- svelte-ignore a11y_img_redundant_alt -->
								<img
									src="/pair_c3.gif"
									alt="Pairing instructions for Comma 3"
									class="h-auto w-full object-contain"
								/>
							{:else if selectedDeviceType === 'c4'}
								<!-- svelte-ignore a11y_img_redundant_alt -->
								<img
									src="/pair_c4.gif"
									alt="Pairing instructions for Comma 4"
									class="h-auto w-full object-contain"
								/>
							{/if}
						</div>

						<div class="rounded-xl bg-blue-500/10 p-4">
							<ol class="list-inside list-decimal space-y-2 text-sm text-blue-200">
								<li>Note: <strong>Wi-Fi</strong> is NOT required for pairing.</li>
								<li>
									Go to <strong class="text-white">Settings &gt; sunnylink</strong> on your device.
								</li>
								<li>
									Tap on
									{#if selectedDeviceType === 'c4'}
										<strong class="text-white">Pair</strong>
									{:else}
										<strong class="text-white">Not Paired</strong>
									{/if}
									(or <strong class="text-white">Paired</strong>
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
		</div>
	</div>
{/if}
