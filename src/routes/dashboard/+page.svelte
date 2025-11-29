<script lang="ts">
	import { goto } from '$app/navigation';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import UpdateAliasModal from '$lib/components/UpdateAliasModal.svelte';
	import DashboardSkeleton from './DashboardSkeleton.svelte';
	import {
		Wifi,
		WifiOff,
		Activity,
		Cpu,
		Save,
		X,
		Loader2,
		ChevronDown,
		ChevronRight,
		Calendar,
		Copy,
		Check
	} from 'lucide-svelte';
	import { slide } from 'svelte/transition';

	let { data } = $props();

	let updateAliasModalOpen = $state(false);
	let offlineSectionOpen = $state(false);
	let copiedDeviceId = $state<string | null>(null);

	$effect(() => {
		if (!authState.loading && !authState.isAuthenticated) {
			goto('/');
		}
	});

	// When modal closes (saved or cancelled), remove focus from any active element
	$effect(() => {
		if (!updateAliasModalOpen) {
			if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
				document.activeElement.blur();
			}
		}
	});

	function handleAliasChange(device: any, newAlias: string) {
		if (!newAlias.trim()) return;
		const originalAlias = deviceState.aliases[device.device_id] ?? device.alias ?? device.device_id;
		deviceState.setAliasOverride(device.device_id, newAlias, originalAlias);
	}

	function getAlias(device: any) {
		// Priority: Unsaved override > Saved store alias > Device alias > Device ID
		return (
			deviceState.aliasOverrides[device.device_id] ??
			deviceState.aliases[device.device_id] ??
			device.alias ??
			device.device_id
		);
	}

	function getPendingChanges(devices: any[]) {
		return Object.entries(deviceState.aliasOverrides)
			.map(([deviceId, newAlias]) => {
				const device = devices.find((d) => d.device_id === deviceId);
				const oldAlias = deviceState.aliases[deviceId] ?? device?.alias ?? deviceId;
				if (newAlias === oldAlias) return null;
				return { deviceId, oldAlias, newAlias };
			})
			.filter((c) => c !== null) as Array<{
			deviceId: string;
			oldAlias: string;
			newAlias: string;
		}>;
	}

	function clearChanges() {
		deviceState.clearAliasOverrides();
	}

	function formatDate(timestamp: number | undefined) {
		if (!timestamp) return 'Unknown';
		return new Date(timestamp * 1000).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function copyToClipboard(text: string, deviceId: string) {
		navigator.clipboard.writeText(text);
		copiedDeviceId = deviceId;
		setTimeout(() => {
			if (copiedDeviceId === deviceId) {
				copiedDeviceId = null;
			}
		}, 2000);
	}

	let devices = $state<any[]>([]);

	$effect(() => {
		if (data.streamed.devices) {
			data.streamed.devices.then((d) => {
				devices = d || [];
			});
		}
	});

	// Helper to sort a list of devices
	function sortDevicesList(list: any[]) {
		return [...list].sort((a, b) => {
			// Helper to get stable alias (ignoring unsaved overrides) for sorting
			const getStableAlias = (d: any) => deviceState.aliases[d.device_id] ?? d.alias ?? d.device_id;

			// 1. Aliased (Aliased first)
			const aliasA = getStableAlias(a);
			const aliasB = getStableAlias(b);
			const hasAliasA = aliasA !== a.device_id;
			const hasAliasB = aliasB !== b.device_id;
			if (hasAliasA !== hasAliasB) return hasAliasA ? -1 : 1;

			// 2. Alphabetical (Alias or ID)
			return aliasA.localeCompare(aliasB);
		});
	}

	let onlineDevices = $derived.by(() => {
		deviceState.version; // Dependency
		if (!devices) return [];
		const list = devices.filter((d) => {
			const status = deviceState.onlineStatuses[d.device_id];
			return status === 'online' || status === 'loading' || status === undefined;
		});
		return sortDevicesList(list);
	});

	let offlineDevices = $derived.by(() => {
		deviceState.version; // Dependency
		if (!devices) return [];
		const list = devices.filter((d) => deviceState.onlineStatuses[d.device_id] === 'offline');
		return sortDevicesList(list);
	});
</script>

{#if authState.loading}
	<DashboardSkeleton />
{:else}
	{#await data.streamed.devices}
		<DashboardSkeleton name={authState.profile?.name ?? undefined} />
	{:then _}
		<div class="space-y-4 pb-24 sm:space-y-6 lg:space-y-8">
			<!-- Header Card -->
			<div class="card border border-[#1e293b] bg-[#0f1726]">
				<div class="card-body p-4 sm:p-6 lg:p-8">
					<div
						class="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8"
					>
						<div class="max-w-2xl space-y-3 sm:space-y-4">
							<p class="text-xs tracking-[0.3em] text-slate-400 uppercase">Daily sunnypilot</p>
							<h1 class="text-2xl font-bold text-white sm:text-3xl md:text-4xl lg:text-5xl">
								Hi {authState.profile?.name || 'there'}!
							</h1>
							<p class="text-lg text-slate-300 sm:text-xl">
								Here's your latest sunnypilot snapshot
							</p>
							<p class="text-sm text-slate-400 sm:text-base">
								Dive in to see new routes, backups, and model insights. Everything you need, all in
								one place.
							</p>
						</div>
					</div>
				</div>
			</div>

			{#if !devices || devices.length === 0}
				<div class="card mt-2 border border-[#1e293b] bg-[#0f1726]">
					<div class="card-body p-4 sm:p-6 lg:p-8">
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<div class="mb-4 rounded-full bg-slate-700/50 p-4">
								<Cpu class="h-12 w-12 text-slate-400" />
							</div>
							<h3 class="text-xl font-semibold text-white sm:text-2xl lg:text-3xl">
								No Devices Found
							</h3>
							<p class="mt-2 text-sm text-slate-400">
								Pair a device to get started with sunnypilot.
							</p>
						</div>
					</div>
				</div>
			{:else}
				<!-- Device List -->
				<div class="space-y-6">
					<!-- Online / Checking Devices -->
					{#each onlineDevices as device (device.device_id)}
						{@const status = deviceState.onlineStatuses[device.device_id]}
						{@const isOnline = status === 'online'}
						{@const isLoading = !status || status === 'loading'}
						{@const isUnregistered =
							device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') === 'unregistereddevice'}
						{@const currentAlias = getAlias(device)}
						{@const hasPendingChange = !!deviceState.aliasOverrides[device.device_id]}

						<div
							class="card border bg-[#0f1726] transition-all duration-300 {hasPendingChange
								? 'border-primary ring-1 ring-primary/50'
								: 'border-[#1e293b]'}"
						>
							<div class="card-body p-6 lg:p-8">
								<div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
									<!-- Device Info / Alias Input -->
									<div class="max-w-xl flex-1 space-y-4">
										<div class="form-control w-full">
											<label class="label" for="alias-{device.device_id}">
												<span
													class="label-text text-xs font-bold tracking-wider text-slate-500 uppercase"
												>
													Device Alias
												</span>
											</label>
											<input
												id="alias-{device.device_id}"
												type="text"
												value={currentAlias}
												oninput={(e) => handleAliasChange(device, e.currentTarget.value)}
												class="input input-lg w-full border-0 border-b-2 border-transparent bg-transparent px-0 text-2xl font-bold text-white placeholder-slate-600 transition-colors hover:border-[#334155] focus:border-primary focus:outline-none"
												placeholder={device.device_id}
											/>
										</div>

										<div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
											<button
												class="group flex items-center gap-2 rounded bg-[#1e293b] px-2 py-1 font-mono text-xs transition-colors hover:bg-[#334155] hover:text-white"
												onclick={() => copyToClipboard(device.device_id, `id-${device.device_id}`)}
												title="Copy Device ID"
											>
												{device.device_id}
												{#if copiedDeviceId === `id-${device.device_id}`}
													<Check size={12} class="text-emerald-400" />
												{:else}
													<Copy
														size={12}
														class="opacity-0 transition-opacity group-hover:opacity-100"
													/>
												{/if}
											</button>
											{#if isLoading}
												<span class="flex items-center gap-1.5 text-slate-400">
													<Loader2 size={16} class="animate-spin" />
													Checking status...
												</span>
											{:else}
												<span class="flex items-center gap-1.5 text-emerald-400">
													<Wifi size={16} />
													Online
												</span>
											{/if}
											<span class="flex items-center gap-1.5 text-slate-500">
												<Calendar size={14} />
												Paired {formatDate(device.created_at)}
											</span>
										</div>
									</div>

									<!-- Quick Actions / Status Cards -->
									<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:w-1/2">
										<div class="rounded-xl border border-[#334155] bg-[#101a29] p-4">
											<div class="mb-2 flex items-center gap-2 text-slate-400">
												<Activity size={18} />
												<span class="text-xs font-bold tracking-wider uppercase">Status</span>
											</div>
											<div class="text-lg font-medium text-white">
												{#if isLoading}
													<span class="flex items-center gap-2">
														<Loader2 size={16} class="animate-spin" />
														Checking...
													</span>
												{:else}
													Connected
												{/if}
											</div>
										</div>

										{#if !isUnregistered}
											<button
												class="group relative rounded-xl border border-[#334155] bg-[#101a29] p-4 text-left transition-colors hover:border-primary/50 hover:bg-[#101a29]/80"
												onclick={() => copyToClipboard(device.comma_dongle_id, device.device_id)}
											>
												<div class="mb-2 flex items-center justify-between text-slate-400">
													<div class="flex items-center gap-2">
														<Cpu size={18} />
														<span class="text-xs font-bold tracking-wider uppercase"
															>Comma Dongle ID</span
														>
													</div>
													{#if copiedDeviceId === device.device_id}
														<Check size={16} class="text-emerald-400" />
													{:else}
														<Copy
															size={16}
															class="opacity-0 transition-opacity group-hover:opacity-100"
														/>
													{/if}
												</div>
												<div class="truncate text-xl font-bold text-white">
													{device.comma_dongle_id}
												</div>
											</button>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/each}

					<!-- Offline Devices Section -->
					{#if offlineDevices.length > 0}
						<div class="rounded-xl border border-[#1e293b] bg-[#0f1726]/50">
							<button
								class="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-[#1e293b]/50"
								onclick={() => (offlineSectionOpen = !offlineSectionOpen)}
							>
								<div class="flex items-center gap-3">
									<div
										class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-400"
									>
										<WifiOff size={16} />
									</div>
									<div>
										<h3 class="font-medium text-slate-300">Offline Devices</h3>
										<p class="text-xs text-slate-500">
											{offlineDevices.length} device{offlineDevices.length === 1 ? '' : 's'}
										</p>
									</div>
								</div>
								{#if offlineSectionOpen}
									<ChevronDown class="text-slate-500" size={20} />
								{:else}
									<ChevronRight class="text-slate-500" size={20} />
								{/if}
							</button>

							{#if offlineSectionOpen}
								<div transition:slide class="space-y-4 border-t border-[#1e293b] p-4">
									{#each offlineDevices as device (device.device_id)}
										{@const isUnregistered =
											device.comma_dongle_id?.toLowerCase().replace(/\s/g, '') ===
											'unregistereddevice'}
										{@const currentAlias = getAlias(device)}
										{@const hasPendingChange = !!deviceState.aliasOverrides[device.device_id]}

										<div
											class="card border bg-[#0f1726] transition-all duration-300 {hasPendingChange
												? 'border-primary ring-1 ring-primary/50'
												: 'border-[#1e293b]'}"
										>
											<div class="card-body p-6 lg:p-8">
												<div
													class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"
												>
													<!-- Device Info / Alias Input -->
													<div class="max-w-xl flex-1 space-y-4">
														<div class="form-control w-full">
															<label class="label" for="alias-{device.device_id}">
																<span
																	class="label-text text-xs font-bold tracking-wider text-slate-500 uppercase"
																>
																	Device Alias
																</span>
															</label>
															<input
																id="alias-{device.device_id}"
																type="text"
																value={currentAlias}
																oninput={(e) => handleAliasChange(device, e.currentTarget.value)}
																class="input input-lg w-full border-0 border-b-2 border-transparent bg-transparent px-0 text-2xl font-bold text-white placeholder-slate-600 transition-colors hover:border-[#334155] focus:border-primary focus:outline-none"
																placeholder={device.device_id}
															/>
														</div>

														<div
															class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400"
														>
															<button
																class="group flex items-center gap-2 rounded bg-[#1e293b] px-2 py-1 font-mono text-xs transition-colors hover:bg-[#334155] hover:text-white"
																onclick={() =>
																	copyToClipboard(device.device_id, `id-${device.device_id}`)}
																title="Copy Device ID"
															>
																{device.device_id}
																{#if copiedDeviceId === `id-${device.device_id}`}
																	<Check size={12} class="text-emerald-400" />
																{:else}
																	<Copy
																		size={12}
																		class="opacity-0 transition-opacity group-hover:opacity-100"
																	/>
																{/if}
															</button>
															<span class="flex items-center gap-1.5 text-red-400">
																<WifiOff size={16} />
																Offline
															</span>
															<span class="flex items-center gap-1.5 text-slate-500">
																<Calendar size={14} />
																Paired {formatDate(device.created_at)}
															</span>
														</div>
													</div>

													<!-- Quick Actions / Status Cards -->
													<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:w-1/2">
														<div class="rounded-xl border border-[#334155] bg-[#101a29] p-4">
															<div class="mb-2 flex items-center gap-2 text-slate-400">
																<Activity size={18} />
																<span class="text-xs font-bold tracking-wider uppercase"
																	>Status</span
																>
															</div>
															<div class="text-lg font-medium text-white">Disconnected</div>
														</div>

														{#if !isUnregistered}
															<button
																class="group relative rounded-xl border border-[#334155] bg-[#101a29] p-4 text-left transition-colors hover:border-primary/50 hover:bg-[#101a29]/80"
																onclick={() =>
																	copyToClipboard(device.comma_dongle_id, device.device_id)}
															>
																<div class="mb-2 flex items-center justify-between text-slate-400">
																	<div class="flex items-center gap-2">
																		<Cpu size={18} />
																		<span class="text-xs font-bold tracking-wider uppercase"
																			>Comma Dongle ID</span
																		>
																	</div>
																	{#if copiedDeviceId === device.device_id}
																		<Check size={16} class="text-emerald-400" />
																	{:else}
																		<Copy
																			size={16}
																			class="opacity-0 transition-opacity group-hover:opacity-100"
																		/>
																	{/if}
																</div>
																<div class="truncate text-xl font-bold text-white">
																	{device.comma_dongle_id}
																</div>
															</button>
														{/if}
													</div>
												</div>

												<div
													class="mt-6 flex items-center gap-4 rounded-lg border border-red-500/20 bg-red-500/5 p-4"
												>
													<WifiOff class="h-5 w-5 shrink-0 text-red-500" />
													<p class="flex-1 text-sm text-slate-400">
														Device is offline. Some features are unavailable.
													</p>
													<button
														class="btn text-red-400 btn-ghost btn-xs hover:bg-red-500/10"
														onclick={async () => {
															if (logtoClient) {
																const token = await logtoClient.getIdToken();
																if (token) {
																	await checkDeviceStatus(device.device_id, token);
																}
															}
														}}
													>
														Retry
													</button>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Unsaved Changes Bar -->
				{@const pendingChanges = getPendingChanges(devices)}
				{#if pendingChanges.length > 0}
					<div
						class="animate-in slide-in-from-bottom-4 fade-in fixed bottom-6 left-1/2 z-40 w-full max-w-2xl -translate-x-1/2 px-4 duration-300"
					>
						<div
							class="flex items-center justify-between gap-4 rounded-xl border border-[#334155] bg-[#1e293b]/95 p-4 shadow-2xl backdrop-blur-md"
						>
							<div class="flex items-center gap-3">
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary"
								>
									<Save size={20} />
								</div>
								<div>
									<p class="font-medium text-white">Unsaved Changes</p>
									<p class="text-xs text-slate-400">
										You have modified {pendingChanges.length} device alias{pendingChanges.length ===
										1
											? ''
											: 'es'}.
									</p>
								</div>
							</div>
							<div class="flex items-center gap-2">
								<button
									class="btn text-slate-400 btn-ghost btn-sm hover:text-white"
									onclick={clearChanges}
								>
									Discard
								</button>
								<button
									class="btn btn-sm btn-primary"
									onclick={() => (updateAliasModalOpen = true)}
								>
									Review & Save
								</button>
							</div>
						</div>
					</div>

					<UpdateAliasModal bind:open={updateAliasModalOpen} changes={pendingChanges} />
				{/if}
			{/if}
		</div>
	{/await}
{/if}
