<script lang="ts">
	import { deviceState } from '$lib/stores/device.svelte';
	import { deviceSelectorState } from '$lib/stores/deviceSelector.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { ChevronDown, X, WifiOff, Check, Smartphone, LayoutDashboard } from 'lucide-svelte';
	import { fade, fly, slide } from 'svelte/transition';
	import { ChevronRight } from 'lucide-svelte';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { devices } = $props<{ devices: any[] }>();

	let isOpen = $state(false);
	let offlineSectionOpen = $state(false);

	// Sync modal state with global store
	$effect(() => {
		deviceSelectorState.open = isOpen;
	});

	let selectedDevice = $derived(
		devices.find((d: any) => d.device_id === deviceState.selectedDeviceId)
	);

	let onlineDevices = $derived(
		deviceState.sortDevices(
			devices.filter((d: any) => {
				const status = deviceState.onlineStatuses[d.device_id];
				return status === 'online' || status === 'loading' || status === undefined;
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
		isOpen = false;
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

		isOpen = false;
	}

	function toggleModal() {
		isOpen = !isOpen;
		if (isOpen) {
			// Refresh statuses when opening, but skip selected device to avoid re-rendering parent
			// (which would close the modal if parent conditionally renders based on status)
			devices.forEach((d: any) => {
				checkStatus(d.device_id);
			});
		}
	}
</script>

<!-- Trigger -->
<button
	class="group flex max-w-full items-center gap-2 rounded-xl border border-[#334155] bg-[#101a29] p-1.5 pr-3 text-left transition-all hover:border-primary/50 hover:bg-[#1e293b] focus:ring-2 focus:ring-primary/50 focus:outline-none md:w-64"
	onclick={toggleModal}
>
	{#if selectedDevice}
		<div class="flex h-8 w-8 min-w-[2rem] items-center justify-center rounded-lg bg-primary/10 text-primary">
			<Smartphone size={16} />
		</div>
		<div class="min-w-0 flex-1 flex-col overflow-hidden">
			<span class="block truncate text-xs font-bold text-white">
				{getAlias(selectedDevice)}
			</span>
			<div class="flex items-center gap-1">
				{#if deviceState.onlineStatuses[selectedDevice.device_id] === 'online'}
					<div class="h-1.5 w-1.5 min-w-[0.375rem] rounded-full bg-emerald-400"></div>
					<span class="truncate text-[10px] text-emerald-400">Online</span>
					{#if deviceState.offroadStatuses[selectedDevice.device_id]}
						{@const status = deviceState.offroadStatuses[selectedDevice.device_id]}
						<span class="text-[10px] text-slate-600">•</span>
						{#if status?.forceOffroad}
							<span class="truncate text-[10px] font-bold text-amber-500">Forced</span>
						{:else if status?.isOffroad}
							<span class="truncate text-[10px] text-blue-400">Offroad</span>
						{:else}
							<span class="truncate text-[10px] text-amber-400">Onroad</span>
						{/if}
					{/if}
				{:else if deviceState.onlineStatuses[selectedDevice.device_id] === 'offline'}
					<div class="h-1.5 w-1.5 min-w-[0.375rem] rounded-full bg-red-400"></div>
					<span class="text-[10px] text-red-400">Offline</span>
				{:else}
					<div class="h-1.5 w-1.5 min-w-[0.375rem] animate-pulse rounded-full bg-amber-400"></div>
					<span class="text-[10px] text-amber-400">Checking...</span>
				{/if}
			</div>
		</div>
	{:else}
		<div
			class="flex h-8 w-8 min-w-[2rem] items-center justify-center rounded-lg bg-slate-800 text-slate-400 group-hover:text-white"
		>
			<LayoutDashboard size={16} />
		</div>
		<div class="flex flex-col">
			<span class="text-xs font-bold text-slate-300 group-hover:text-white">Overview</span>
			<span class="text-[10px] text-slate-500 group-hover:text-slate-400">Select Device</span>
		</div>
	{/if}
	<ChevronDown
		size={14}
		class="ml-auto text-slate-500 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
	/>
</button>

<!-- Modal -->
{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:pt-20"
		role="dialog"
		aria-modal="true"
	>
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
			transition:fade={{ duration: 200 }}
			onclick={() => (isOpen = false)}
			aria-label="Close modal"
		></button>

		<!-- Content -->
		<div
			class="relative w-full max-w-md overflow-hidden rounded-t-2xl border border-[#334155] bg-[#0f1726] shadow-2xl sm:rounded-2xl"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<div class="flex items-center justify-between border-b border-[#1e293b] p-4">
				<h3 class="font-semibold text-white">Select Device</h3>
				<button
					class="rounded-lg p-2 text-slate-400 hover:bg-[#1e293b] hover:text-white"
					onclick={() => (isOpen = false)}
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
						: 'border-transparent hover:bg-[#1e293b]'}"
					onclick={clearSelection}
				>
					<span
						class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e293b] text-slate-400"
					>
						<LayoutDashboard size={20} />
					</span>
					<span class="flex flex-col items-start">
						<span class="font-medium text-white">Overview</span>
						<span class="text-xs text-slate-400">View all devices</span>
					</span>
					{#if !selectedDevice}
						<Check size={18} class="ml-auto text-primary" />
					{/if}
				</button>

				<div class="divider my-2 text-xs text-slate-500">Online Devices</div>

				{#each onlineDevices as device}
					{@const isSelected = device.device_id === deviceState.selectedDeviceId}
					{@const status = deviceState.onlineStatuses[device.device_id]}

					<button
						class="flex w-full items-center gap-3 rounded-xl border p-3 transition-all
							{isSelected
							? 'border-primary bg-primary/5 ring-1 ring-primary/50'
							: 'border-[#1e293b] bg-[#101a29] hover:border-primary/30 hover:bg-[#1e293b]'}"
						onclick={() => selectDevice(device)}
					>
						<span
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e293b] text-slate-400"
						>
							<Smartphone size={20} class={isSelected ? 'text-primary' : ''} />
						</span>
						<span class="flex flex-col items-start overflow-hidden">
							<span class="w-full truncate text-left font-medium text-white">
								{getAlias(device)}
							</span>
							<span class="flex items-center gap-1.5">
								{#if status === 'online'}
									<div class="h-1.5 w-1.5 rounded-full bg-emerald-400"></div>
									<span class="text-xs text-emerald-400">Online</span>
									{#if deviceState.offroadStatuses[device.device_id]}
										{@const offroadStatus = deviceState.offroadStatuses[device.device_id]}
										<span class="text-[10px] text-slate-600">•</span>
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
								{:else}
									<div class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400"></div>
									<span class="text-xs text-amber-400">Checking...</span>
								{/if}
								<span class="text-[10px] text-slate-500">• {device.device_id}</span>
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
							class="flex w-full items-center justify-between rounded-lg p-2 text-left text-xs font-medium text-slate-500 hover:bg-[#1e293b] hover:text-slate-300"
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
											: 'border-[#1e293b] bg-[#101a29]/50 hover:border-primary/30 hover:bg-[#1e293b]'}"
										onclick={() => selectDevice(device)}
									>
										<span
											class="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1e293b] text-slate-500"
										>
											<Smartphone size={20} class={isSelected ? 'text-primary' : ''} />
										</span>
										<span class="flex flex-col items-start overflow-hidden">
											<span class="w-full truncate text-left font-medium text-slate-300">
												{getAlias(device)}
											</span>
											<span class="flex items-center gap-1.5">
												<span class="h-1.5 w-1.5 rounded-full bg-red-400"></span>
												<span class="text-xs text-red-400">Offline</span>
												<span class="text-[10px] text-slate-500">• {device.device_id}</span>
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
