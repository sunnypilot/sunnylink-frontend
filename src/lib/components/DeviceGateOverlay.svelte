<script lang="ts">
	import { WifiOff } from 'lucide-svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';

	let {
		deviceName = '',
		deviceId = '',
		devices = [],
		retrying = false,
		onRetry
	} = $props<{
		deviceName?: string;
		deviceId?: string;
		devices?: any[];
		retrying?: boolean;
		onRetry?: () => void;
	}>();
</script>

<!--
  Blocking overlay for device-offline state only.
  Rendered in root +layout.svelte OUTSIDE the DaisyUI drawer so
  `fixed` positioning works against the true viewport.

  overflow-y-auto + min-h-full + items-center ensures the card
  is centered when space allows and scrollable when it doesn't.
-->
<div
	role="dialog"
	aria-modal="true"
	aria-label="Device connection required"
	class="fixed inset-0 z-[60] overflow-y-auto bg-black/50 backdrop-blur-sm"
>
	<div class="flex min-h-full items-center justify-center p-4 sm:p-6">
		<div
			class="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-2xl sm:max-w-md"
		>
			<div class="flex flex-col items-center p-6 text-center sm:p-8">
				<div class="mb-3 rounded-full bg-red-500/10 p-3 sm:mb-4 sm:p-4">
					<WifiOff class="h-8 w-8 text-red-500 sm:h-10 sm:w-10" />
				</div>
				<h3 class="text-base font-semibold text-[var(--sl-text-1)] sm:text-lg">
					Device Connection Required
				</h3>
				<p class="mt-1 text-sm font-medium text-[var(--sl-text-2)]">
					{deviceName}
					{#if deviceId && deviceId !== deviceName}
						<span class="block text-xs font-normal text-[var(--sl-text-3)]">
							({deviceId})
						</span>
					{/if}
				</p>
				<p class="mt-2 text-[0.8125rem] leading-relaxed text-[var(--sl-text-2)] sm:text-sm">
					This device appears to be offline. Please check its connectivity and try again.
				</p>
				{#if onRetry}
					<button
						class="btn btn-primary btn-sm mt-4"
						disabled={retrying}
						onclick={onRetry}
					>
						{#if retrying}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Retry Connection
					</button>
				{/if}
			</div>

			{#if devices.length > 0}
				<div class="border-t border-[var(--sl-border)] bg-[var(--sl-bg-input)] px-6 py-4">
					<p class="mb-2 text-center text-[0.6875rem] font-medium tracking-wider text-[var(--sl-text-3)] uppercase sm:text-xs">
						or select another device
					</p>
					<DeviceSelector {devices} />
				</div>
			{/if}
		</div>
	</div>
</div>
