<script lang="ts">
	import { Shield, Info, Wifi } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';
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
	<div
		role="dialog"
		aria-modal="true"
		aria-label="Device connection required"
		class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-0"
		use:portal
		use:modalLock
	>
		<button
			class="absolute inset-0 bg-black/40 backdrop-blur-sm"
			transition:fade={{ duration: 200 }}
			onclick={handleClose}
			aria-label="Close modal"
		></button>
		<div
			class="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-2xl"
			transition:fly={{ y: 8, duration: 150, easing: cubicOut, opacity: 0 }}
		>
			<div class="border-b border-[var(--sl-border)] bg-[var(--sl-bg-input)] p-4 sm:p-6">
				<div class="flex items-center gap-3">
					<div class="rounded-full bg-primary/10 p-2 text-primary">
						<Wifi size={24} />
					</div>
					<h3 class="text-lg font-bold text-[var(--sl-text-1)] sm:text-xl">
						Device Connection Required
					</h3>
				</div>
			</div>

			<div class="space-y-3 p-4 sm:space-y-4 sm:p-6">
				<p class="text-sm text-[var(--sl-text-2)] sm:text-base">
					To configure settings, your device must be online. Here's why:
				</p>

				<div class="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-input)] p-3 sm:p-4">
					<div class="flex gap-3">
						<Shield class="shrink-0 text-primary" size={20} />
						<div>
							<h4 class="mb-1 font-medium text-[var(--sl-text-1)]">Privacy First</h4>
							<p class="text-sm text-[var(--sl-text-2)]">
								We do <strong>not</strong> store your device settings on our servers. We require a direct
								connection to your device to fetch its current configuration.
							</p>
						</div>
					</div>
				</div>

				<div class="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-input)] p-3 sm:p-4">
					<div class="flex gap-3">
						<Info class="shrink-0 text-primary" size={20} />
						<div>
							<h4 class="mb-1 font-medium text-[var(--sl-text-1)]">Encrypted Backups</h4>
							<p class="text-sm text-[var(--sl-text-2)]">
								While we store backups, they are encrypted with your device's private key. Only your
								device is able to decrypt them locally.
							</p>
						</div>
					</div>
				</div>
			</div>

			<div
				class="flex flex-col gap-3 border-t border-[var(--sl-border)] bg-[var(--sl-bg-input)] p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-6"
			>
				<label class="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						class="checkbox border-slate-500 checkbox-sm checkbox-primary"
						bind:checked={dontRemind}
					/>
					<span class="text-sm text-[var(--sl-text-2)]">Don't remind me again on this browser</span>
				</label>

				<button
					class="btn min-w-[100px] btn-primary transition-all duration-100 active:scale-[0.97] active:bg-primary/80"
					onclick={handleClose}
				>
					Got it
				</button>
			</div>
		</div>
	</div>
{/if}
