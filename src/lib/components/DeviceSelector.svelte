<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { deviceSelectorState } from '$lib/stores/deviceSelector.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import {
		ChevronDown,
		X,
		WifiOff,
		Check,
		Smartphone,
		LayoutDashboard,
		TriangleAlert
	} from 'lucide-svelte';
	import { fade, fly, slide } from 'svelte/transition';
	import { ChevronRight } from 'lucide-svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { devices } = $props<{ devices: any[] }>();

	let offlineSectionOpen = $state(false);

	let selectedDevice = $derived(
		devices.find((d: any) => d.device_id === deviceState.selectedDeviceId)
	);

	let onlineDevices = $derived(
		deviceState.sortDevices(
			devices.filter((d: any) => {
				const status = deviceState.onlineStatuses[d.device_id];
				return (
					status === 'online' || status === 'loading' || status === 'error' || status === undefined
				);
			})
		)
	);

	let offlineDevices = $derived(
		deviceState.sortDevices(
			devices.filter((d: any) => deviceState.onlineStatuses[d.device_id] === 'offline')
		)
	);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function getAlias(device: any) {
		return deviceState.aliases[device.device_id] ?? device.alias ?? device.device_id;
	}

	async function checkStatus(deviceId: string) {
		if (logtoClient) {
			const token = await logtoClient.getIdToken();
			if (token) {
				await checkDeviceStatus(deviceId, token);
			}
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function selectDevice(device: any) {
		deviceState.setSelectedDevice(device.device_id);
		deviceSelectorState.isOpen = false;
		checkStatus(device.device_id);
	}

	function clearSelection() {
		deviceState.setSelectedDevice(''); // Or handle undefined better in store if needed, currently string
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem('selectedDeviceId');
		}
		// Force update store state if needed, but setSelectedDevice handles it
		// Actually deviceState.selectedDeviceId is string | undefined.
		// Let's make sure we set it to undefined effectively.
		// The store setter takes string. Let's pass empty string or modify store to accept undefined?
		// Store definition: setSelectedDevice(deviceId: string).
		// Let's assume empty string is "no selection" or modify store.
		// Checking store: selectedDeviceId: ... as string | undefined.
		// setSelectedDevice(deviceId: string) { this.selectedDeviceId = deviceId; ... }
		// So passing '' sets it to ''.
		// In layout we check `deviceState.selectedDeviceId`. '' is falsy. So it works.

		// Wait, better to be explicit.
		// But I can't change store signature here easily without another file edit.
		// Passing '' is fine for now as it is falsy.
		deviceState.selectedDeviceId = undefined;
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem('selectedDeviceId');
		}

		deviceSelectorState.isOpen = false;
	}

	function toggleModal() {
		deviceSelectorState.toggle();
		if (deviceSelectorState.isOpen) {
			// Refresh statuses when opening, but skip selected device to avoid re-rendering parent
			// (which would close the modal if parent conditionally renders based on status)
			devices.forEach((d: any) => {
				if (d.device_id !== deviceState.selectedDeviceId) {
					checkStatus(d.device_id);
				}
			});
		}
	}
</script>

<!-- Trigger -->
<button
	class="group flex max-w-full items-center gap-2 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-1.5 pr-3 text-left transition-all hover:border-primary/50 hover:bg-[var(--sl-bg-elevated)] focus:ring-2 focus:ring-primary/50 focus:outline-none md:w-64"
	onclick={toggleModal}
>
	{#if selectedDevice}
		<div
			class="flex h-10 w-10 min-w-[2.5rem] items-center justify-center rounded-lg bg-primary/10 text-primary"
		>
			<Smartphone size={16} />
		</div>
		<div class="min-w-0 flex-1 flex-col overflow-hidden">
			<span class="block truncate text-xs font-bold text-[var(--sl-text-1)]">
				{getAlias(selectedDevice)}
			</span>
			<div class="flex items-center gap-1">
				{#if deviceState.onlineStatuses[selectedDevice.device_id] === 'online'}
					<div class="h-1.5 w-1.5 min-w-[0.375rem] rounded-full bg-emerald-400"></div>
					<span class="truncate text-xs text-emerald-400">Online</span>
					{#if deviceState.offroadStatuses[selectedDevice.device_id]}
						{@const status = deviceState.offroadStatuses[selectedDevice.device_id]}
						<span class="text-xs text-[var(--sl-text-3)]">•</span>
						{#if status?.forceOffroad}
							<span class="truncate text-xs font-bold text-amber-500">Forced</span>
						{:else if status?.isOffroad}
							<span class="truncate text-xs text-blue-400">Offroad</span>
						{:else}
							<span class="truncate text-xs text-amber-400">Onroad</span>
						{/if}
					{/if}
				{:else if deviceState.onlineStatuses[selectedDevice.device_id] === 'offline'}
					<div class="h-1.5 w-1.5 min-w-[0.375rem] rounded-full bg-red-400"></div>
					<span class="text-xs text-red-400">Offline</span>
				{:else if deviceState.onlineStatuses[selectedDevice.device_id] === 'error'}
					<TriangleAlert size={14} class="text-amber-500" />
					<span
						class="truncate text-xs text-amber-500"
						title={deviceState.lastErrorMessages[selectedDevice.device_id]}>Error</span
					>
				{:else}
					<div class="h-1.5 w-1.5 min-w-[0.375rem] animate-pulse rounded-full bg-amber-400"></div>
					<span class="text-xs text-amber-400">Checking...</span>
				{/if}
			</div>
		</div>
	{:else}
		<div
			class="flex h-10 w-10 min-w-[2.5rem] items-center justify-center rounded-lg bg-[var(--sl-bg-surface)] text-[var(--sl-text-2)] group-hover:text-[var(--sl-text-1)]"
		>
			<LayoutDashboard size={16} />
		</div>
		<div class="flex flex-col">
			<span class="text-xs font-bold text-[var(--sl-text-2)] group-hover:text-[var(--sl-text-1)]">Overview</span>
			<span class="text-xs text-[var(--sl-text-3)] group-hover:text-[var(--sl-text-2)]">Select Device</span>
		</div>
	{/if}
	<ChevronDown
		size={14}
		class="ml-auto text-[var(--sl-text-3)] transition-transform duration-200 {deviceSelectorState.isOpen ? 'rotate-180' : ''}"
	/>
</button>

<!-- Modal -->
{#if deviceSelectorState.isOpen}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:pt-20"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
			transition:fade={{ duration: 200 }}
			onclick={() => (deviceSelectorState.isOpen = false)}
			aria-label="Close modal"
		></button>

		<!-- Content -->
		<div
			class="relative w-full max-w-md overflow-hidden rounded-t-2xl border border-[var(--sl-border)] bg-[var(--sl-bg-input)] shadow-2xl sm:rounded-2xl"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<div class="flex items-center justify-between border-b border-[var(--sl-border)] p-4">
				<h3 class="font-semibold text-[var(--sl-text-1)]">Select Device</h3>
				<button
					class="rounded-lg p-2 text-[var(--sl-text-2)] hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)]"
					onclick={() => (deviceSelectorState.isOpen = false)}
				>
					<X size={20} />
				</button>
			</div>

			<div class="max-h-[60vh] space-y-2 overflow-y-auto p-2 sm:p-4">
				<!-- Overview Option -->
				<button
					class="flex w-full items-center gap-3 rounded-xl border p-3 transition-all
						{!selectedDevice
						? 'border-primary bg-primary/5 ring-1 ring-primary/50'
						: 'border-transparent hover:bg-[var(--sl-bg-elevated)]'}"
					onclick={clearSelection}
				>
					<span
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--sl-bg-elevated)] text-[var(--sl-text-2)]"
					>
						<LayoutDashboard size={20} />
					</span>
					<span class="flex flex-col items-start">
						<span class="font-medium text-[var(--sl-text-1)]">Overview</span>
						<span class="text-xs text-[var(--sl-text-2)]">View all devices</span>
					</span>
					{#if !selectedDevice}
						<Check size={18} class="ml-auto text-primary" />
					{/if}
				</button>

				<div class="divider my-2 text-xs text-[var(--sl-text-3)]">Online Devices</div>

				{#each onlineDevices as device}
					{@const isSelected = device.device_id === deviceState.selectedDeviceId}
					{@const status = deviceState.onlineStatuses[device.device_id]}

					<button
						class="flex w-full items-center gap-3 rounded-xl border p-3 transition-all
							{isSelected
							? 'border-primary bg-primary/5 ring-1 ring-primary/50'
							: 'border-[var(--sl-border)] bg-[var(--sl-bg-surface)] hover:border-primary/30 hover:bg-[var(--sl-bg-elevated)]'}"
						onclick={() => selectDevice(device)}
					>
						<span
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--sl-bg-elevated)] text-[var(--sl-text-2)]"
						>
							<Smartphone size={20} class={isSelected ? 'text-primary' : ''} />
						</span>
						<span class="flex flex-col items-start overflow-hidden">
							<span class="w-full truncate text-left font-medium text-[var(--sl-text-1)]">
								{getAlias(device)}
							</span>
							<span class="flex items-center gap-1.5">
								{#if status === 'online'}
									<div class="h-1.5 w-1.5 rounded-full bg-emerald-400"></div>
									<span class="text-xs text-emerald-400">Online</span>
									{#if deviceState.offroadStatuses[device.device_id]}
										{@const offroadStatus = deviceState.offroadStatuses[device.device_id]}
										<span class="text-xs text-[var(--sl-text-3)]">•</span>
										{#if offroadStatus?.forceOffroad}
											<span class="text-xs font-bold text-amber-500">Forced</span>
										{:else if offroadStatus?.isOffroad}
											<span class="text-xs text-blue-400">Offroad</span>
										{:else}
											<span class="text-xs text-amber-400">Onroad</span>
										{/if}
									{/if}
								{:else if status === 'offline'}
									<div class="h-1.5 w-1.5 rounded-full bg-red-400"></div>
									<span class="text-xs text-red-400">Offline</span>
								{:else if status === 'error'}
									<TriangleAlert size={12} class="text-amber-500" />
									<span
										class="text-xs text-amber-500"
										title={deviceState.lastErrorMessages[device.device_id]}>Error</span
									>
								{:else}
									<div class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"></div>
									<span class="text-xs text-amber-400">Checking...</span>
								{/if}
								<span class="text-xs text-[var(--sl-text-3)]">• {device.device_id}</span>
							</span>
						</span>
						{#if isSelected}
							<Check size={18} class="ml-auto text-primary" />
						{/if}
					</button>
				{/each}

				{#if offlineDevices.length > 0}
					<div class="pt-2">
						<button
							class="flex w-full items-center justify-between rounded-lg p-2 text-left text-xs font-medium text-[var(--sl-text-3)] hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-2)]"
							onclick={() => (offlineSectionOpen = !offlineSectionOpen)}
						>
							<span class="flex items-center gap-2">
								<WifiOff size={14} />
								<span>Offline Devices ({offlineDevices.length})</span>
							</span>
							{#if offlineSectionOpen}
								<ChevronDown size={14} />
							{:else}
								<ChevronRight size={14} />
							{/if}
						</button>

						{#if offlineSectionOpen}
							<div transition:slide class="mt-2 space-y-2 pl-2">
								{#each offlineDevices as device}
									{@const isSelected = device.device_id === deviceState.selectedDeviceId}

									<button
										class="flex w-full items-center gap-3 rounded-xl border p-3 transition-all
											{isSelected
											? 'border-primary bg-primary/5 ring-1 ring-primary/50'
											: 'border-[var(--sl-border)] bg-[var(--sl-bg-surface)]/50 hover:border-primary/30 hover:bg-[var(--sl-bg-elevated)]'}"
										onclick={() => selectDevice(device)}
									>
										<span
											class="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--sl-bg-elevated)] text-[var(--sl-text-3)]"
										>
											<Smartphone size={20} class={isSelected ? 'text-primary' : ''} />
										</span>
										<span class="flex flex-col items-start overflow-hidden">
											<span class="w-full truncate text-left font-medium text-[var(--sl-text-2)]">
												{getAlias(device)}
											</span>
											<span class="flex items-center gap-1.5">
												<span class="h-1.5 w-1.5 rounded-full bg-red-400"></span>
												<span class="text-xs text-red-400">Offline</span>
												<span class="text-xs text-[var(--sl-text-3)]">• {device.device_id}</span>
											</span>
										</span>
										{#if isSelected}
											<Check size={18} class="ml-auto text-primary" />
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
