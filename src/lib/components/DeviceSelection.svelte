<script lang="ts">
	import { type Device } from '$lib/types/types';
	import { fly } from 'svelte/transition';

	interface Props {
		devices: Device;
		selectedDevice: string;
		disabled?: boolean;
		onSelect: (deviceId: string) => void;
	}

	let { devices, selectedDevice, disabled = false, onSelect }: Props = $props();

	let dropdownOpen = $state(false);
	let searchQuery = $state('');

	const filteredDevices = $derived(
		devices.filter((device) =>
			(device.device_id ?? '').toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	const handleSelect = (deviceId: string) => {
		onSelect(deviceId);
		dropdownOpen = false;
		searchQuery = '';
	};

	const handleClickOutside = (event: MouseEvent) => {
		const target = event.target as Element;
		if (!target.closest('[data-device-dropdown]')) {
			dropdownOpen = false;
		}
	};
</script>

<svelte:document onclick={handleClickOutside} />

<div class="space-y-2">
	<label for="device-select" class="text-sm font-medium">Device</label>
	<div class="relative" data-device-dropdown>
		<button
			id="device-select"
			onclick={() => (dropdownOpen = !dropdownOpen)}
			{disabled}
			class="btn btn-outline w-full justify-between"
		>
			<span>
				{selectedDevice || 'Select a device...'}
			</span>
			<svg
				class="h-4 w-4 transition-transform {dropdownOpen ? 'rotate-180' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if dropdownOpen}
			<div
				class="dropdown-content menu rounded-box bg-base-100 absolute z-10 mt-1 w-full shadow-lg"
				transition:fly={{ y: -4, duration: 200 }}
			>
				{#if devices.length > 1}
					<div class="border-b p-2">
						<input
							bind:value={searchQuery}
							placeholder="Search devices..."
							class="input input-bordered input-sm w-full"
						/>
					</div>
				{/if}
				<div class="max-h-48 overflow-auto py-1">
					{#if filteredDevices.length === 0}
						<div class="px-3 py-2 text-sm opacity-60">No devices found</div>
					{:else}
						{#each filteredDevices as device}
							<button
								onclick={() => handleSelect(device.device_id ?? '')}
								class="hover:bg-base-200 flex w-full items-center px-3 py-2 text-left text-sm {selectedDevice ===
								(device.device_id ?? '')
									? 'bg-base-200 font-medium'
									: ''}"
							>
								<div class="flex-1">
									<div class="font-medium">{device.device_id ?? ''}</div>
								</div>
								{#if selectedDevice === (device.device_id ?? '')}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
