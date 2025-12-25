<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Map as MapIcon, Download, AlertCircle, Loader2, RefreshCw } from 'lucide-svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { setDeviceParams, checkDeviceStatus } from '$lib/api/device';
	import { v1Client } from '$lib/api/client';
	import { logtoClient, authState } from '$lib/logto/auth.svelte';
	import { decodeParamValue } from '$lib/utils/device';
	import type { OSMRegion } from '$lib/types/osm';
	import { toastState } from '$lib/stores/toast.svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import ComboBox from '$lib/components/ComboBox.svelte';
	import DashboardSkeleton from '../DashboardSkeleton.svelte';

	let countries: OSMRegion[] = $state([]);
	let states: OSMRegion[] = $state([]);
	let loadingRegions = $state(false);
	let downloading = $state(false);
	let loadingOsmParams = $state(false);
	let error = $state<string | null>(null);

	let { data } = $props();

	let isOffline = $derived(
		deviceState.selectedDeviceId &&
			deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'offline'
	);

	let isCheckingStatus = $derived(
		deviceState.selectedDeviceId &&
			(deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'loading' ||
				deviceState.onlineStatuses[deviceState.selectedDeviceId] === undefined)
	);

	// Check status on mount / device change if not already online
	$effect(() => {
		const deviceId = deviceState.selectedDeviceId;
		logtoClient?.getIdToken().then((token) => {
			if (token && deviceId) {
				fetchOsmParams(deviceId, token);
			}
		});
	});

	async function fetchOsmParams(deviceId: string, token: string, redrawUI: boolean = true) {
		loadingOsmParams = true && redrawUI;
		try {
			const osmParams = new Set([
				'OsmLocationName',
				'OsmLocationTitle',
				'OsmStateName',
				'OsmStateTitle',
				'OSMDownloadProgress',
				'OsmDbUpdatesCheck',
				'OsmDownloadedDate'
			]);

			const res = await v1Client.GET('/v1/settings/{deviceId}/values', {
				params: {
					path: { deviceId },
					query: {
						paramKeys: Array.from(osmParams)
					}
				},
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.data?.items) {
				// We need to merge these into deviceState.deviceSettings
				// Check if we have existing settings for this device, if not init
				const existing = deviceState.deviceSettings[deviceId] || [];

				// Map new items to dictionary for easy lookup
				const newItemsMap = new Map(res.data.items.map((i) => [i.key, i]));

				const filtered = existing.filter((i) => !osmParams.has(i.key));
				const updated = [...filtered, ...res.data.items];

				deviceState.deviceSettings[deviceId] = updated;
			}
		} catch (e) {
			console.error('Failed to fetch OSM params', e);
		} finally {
			loadingOsmParams = false;
		}
	}

	// Form State
	let selectedCountry = $state<string>('');
	let selectedState = $state<string>('');

	function getParamValue(deviceId: string, key: string): any {
		const settings = deviceState.deviceSettings[deviceId];
		if (!settings) return null;
		const param = settings.find((p) => p.key === key);
		if (!param) return null;
		return decodeParamValue(param);
	}

	// Device Param State (derived/synced)
	let currentCountryName = $derived(
		deviceState.selectedDeviceId
			? getParamValue(deviceState.selectedDeviceId, 'OsmLocationName')
			: null
	);
	let currentStateName = $derived(
		deviceState.selectedDeviceId
			? getParamValue(deviceState.selectedDeviceId, 'OsmStateName')
			: null
	);
	let downloadProgressParam = $derived(
		deviceState.selectedDeviceId
			? getParamValue(deviceState.selectedDeviceId, 'OSMDownloadProgress')
			: null
	);
	let dbUpdatesCheck = $derived(
		deviceState.selectedDeviceId
			? getParamValue(deviceState.selectedDeviceId, 'OsmDbUpdatesCheck')
			: null
	);
	let downloadedDateParam = $derived(
		deviceState.selectedDeviceId
			? getParamValue(deviceState.selectedDeviceId, 'OsmDownloadedDate')
			: null
	);

	// Computed status
	let downloadProgress = $derived.by(() => {
		if (downloadProgressParam) {
			try {
				const prog =
					typeof downloadProgressParam === 'string'
						? JSON.parse(downloadProgressParam)
						: downloadProgressParam;
				if (prog.total_files > 0 && prog.downloaded_files < prog.total_files) {
					return `${prog.downloaded_files}/${prog.total_files}`;
				}
				return '';
			} catch {
				return '';
			}
		}
		return '';
	});

	let isDownloading = $derived.by(() => {
		if (
			dbUpdatesCheck === '1' ||
			dbUpdatesCheck === true ||
			dbUpdatesCheck === 'true' ||
			downloadProgress !== ''
		)
			return true;
		return false;
	});

	$effect(() => {
		if (isDownloading) {
			checkDownloadProgress(false);
		}
	});

	async function checkDownloadProgress(redrawUI: boolean = true) {
		logtoClient?.getIdToken().then((token) => {
			// Poll download progress every 3 seconds
			const interval = setInterval(() => {
				if (deviceState.selectedDeviceId && token && isDownloading) {
					fetchOsmParams(deviceState.selectedDeviceId, token, redrawUI);
				} else {
					clearInterval(interval);
				}
			}, 5000);
		});
	}

	onMount(async () => {
		await fetchCountries();
	});

	// Sync selection from params when they become available (e.g. after refresh)
	$effect(() => {
		if (currentCountryName && !selectedCountry) {
			selectedCountry = currentCountryName;
			if (currentCountryName === 'US' && states.length === 0) {
				fetchStates().then(() => {
					if (currentStateName && !selectedState) {
						selectedState = currentStateName;
					}
				});
			} else if (currentStateName && !selectedState) {
				selectedState = currentStateName;
			}
		}
	});

	async function fetchCountries() {
		loadingRegions = true;
		try {
			const res = await fetch(
				'https://raw.githubusercontent.com/pfeiferj/openpilot-mapd/main/nation_bounding_boxes.json'
			);
			const data = await res.json();
			countries = Object.entries(data)
				.map(([k, v]: [string, any]) => ({
					ref: k,
					display_name: v.display_name || v.full_name || k
				}))
				.sort((a, b) => a.display_name.localeCompare(b.display_name));
		} catch (e) {
			console.error('Failed to fetch countries', e);
			error = 'Failed to load region data.';
		} finally {
			loadingRegions = false;
		}
	}

	async function fetchStates() {
		loadingRegions = true;
		try {
			const res = await fetch(
				'https://raw.githubusercontent.com/pfeiferj/openpilot-mapd/main/us_states_bounding_boxes.json'
			);
			const data = await res.json();
			states = Object.entries(data)
				.map(([k, v]: [string, any]) => ({
					ref: k,
					display_name: v.display_name || v.full_name || k
				}))
				.sort((a, b) => a.display_name.localeCompare(b.display_name));
			// Add "All" option
			states.unshift({ ref: 'All', display_name: 'All states (~6.0 GB)' });
		} catch (e) {
			console.error('Failed to fetch states', e);
		} finally {
			loadingRegions = false;
		}
	}

	$effect(() => {
		if (selectedCountry === 'US' && states.length === 0) {
			fetchStates();
		}
	});

	async function handleSaveAndDownload() {
		if (!deviceState.selectedDeviceId || !logtoClient) return;
		const token = await logtoClient.getIdToken();
		if (!token) return;

		downloading = true;
		try {
			const countryObj = countries.find((c) => c.ref === selectedCountry);
			const stateObj = states.find((s) => s.ref === selectedState);

			const paramsToSet = [
				{ key: 'OsmLocationName', value: selectedCountry },
				{ key: 'OsmLocationTitle', value: countryObj?.display_name || selectedCountry },
				{ key: 'OsmLocal', value: '1' }, // True
				{ key: 'OsmDbUpdatesCheck', value: '1' }
			];

			if (selectedCountry === 'US' && stateObj) {
				paramsToSet.push(
					{ key: 'OsmStateName', value: selectedState },
					{ key: 'OsmStateTitle', value: stateObj.display_name }
				);
			} else {
				paramsToSet.push({ key: 'OsmStateName', value: '' }, { key: 'OsmStateTitle', value: '' });
			}

			await setDeviceParams(deviceState.selectedDeviceId, paramsToSet, token);
			toastState.show('Download started on device', 'success');

			// Poll for status update
			setTimeout(() => {
				if (deviceState.selectedDeviceId && token) {
					// Fetch specific params to update UI immediately
					fetchOsmParams(deviceState.selectedDeviceId, token);
				}
			}, 1000);

			// Poll progress
			checkDownloadProgress(true);
		} catch (e) {
			console.error('Failed to start download', e);
			toastState.show('Failed to start download', 'error');
		} finally {
			downloading = false;
		}
	}

	async function handleCheckForUpdates() {
		if (!deviceState.selectedDeviceId || !logtoClient) return;
		const token = await logtoClient.getIdToken();
		if (!token) return;

		try {
			await setDeviceParams(
				deviceState.selectedDeviceId,
				[{ key: 'OsmDbUpdatesCheck', value: '1' }],
				token
			);
			toastState.show('Checking for updates...', 'success');
			fetchOsmParams(deviceState.selectedDeviceId, token, true);
			checkDownloadProgress(false);
		} catch (e) {
			toastState.show('Failed to check for updates', 'error');
		}
	}

	function formatTimeAgo(timestamp: string | null) {
		if (!timestamp) return 'Never';
		try {
			// python time.time() is seconds, js Date needs ms
			const date = new Date(parseFloat(timestamp) * 1000);
			const now = new Date();
			const diffMs = now.getTime() - date.getTime();
			const diffSec = Math.round(diffMs / 1000);
			const diffMin = Math.round(diffSec / 60);
			const diffHour = Math.round(diffMin / 60);
			const diffDay = Math.round(diffHour / 24);

			if (diffSec < 60) return 'Just now';
			if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
			if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
			return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
		} catch {
			return 'Unknown';
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400"
			>
				<MapIcon size={24} />
			</div>
			<div>
				<h1 class="text-2xl font-bold text-white">OpenStreetMap</h1>
				<p class="text-slate-400">Manage offline maps</p>
			</div>
		</div>
	</div>

	{#if authState.loading}
		<DashboardSkeleton />
	{:else if !deviceState.selectedDeviceId}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<div class="mb-4 rounded-full bg-slate-700/50 p-4">
				<MapIcon class="h-12 w-12 text-slate-400" />
			</div>
			<h3 class="text-xl font-semibold text-white">No Device Selected</h3>
			<p class="mt-2 text-slate-400">Select a device to manage maps.</p>
		</div>
	{:else if isOffline}
		{#await data.streamed.devices then devices}
			{@const selectedDevice = devices?.find(
				(d: { device_id: string | null }) => d.device_id === deviceState.selectedDeviceId
			)}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="mb-4 rounded-full bg-red-500/10 p-4">
					<AlertCircle class="h-12 w-12 text-red-500" />
				</div>
				<h3 class="text-xl font-semibold text-white">
					Device Offline: {selectedDevice?.alias ?? selectedDevice?.device_id ?? 'Unknown'}
					{#if selectedDevice?.alias}
						<span class="block text-sm font-normal text-slate-400"
							>({selectedDevice?.device_id})</span
						>
					{/if}
				</h3>
				<p class="mt-2 max-w-md text-slate-400">Your device needs to be online to manage maps.</p>
				<div class="mt-6">
					<button
						class="btn btn-sm btn-primary"
						onclick={async () => {
							if (deviceState.selectedDeviceId && logtoClient) {
								const token = await logtoClient.getIdToken();
								if (token) {
									await checkDeviceStatus(deviceState.selectedDeviceId, token);
								}
							}
						}}
					>
						Retry Connection
					</button>
					<div class="divider text-xs tracking-widest text-slate-600">OR SELECT ANOTHER DEVICE</div>
					{#if devices}
						<DeviceSelector {devices} />
					{/if}
				</div>
			</div>
		{/await}
	{:else if isCheckingStatus}
		<div class="animate-pulse space-y-6">
			<div class="flex items-center gap-2 text-slate-400">
				<span class="loading loading-sm loading-spinner"></span>
				<span>Checking device status...</span>
			</div>
			<div class="h-48 w-full rounded bg-slate-700"></div>
			<div class="h-64 w-full rounded bg-slate-700"></div>
		</div>
	{:else}
		<div class="space-y-6">
			{#if loadingOsmParams}
				<div
					class="rounded-xl border border-[#334155] bg-[#1e293b]/50 p-12 backdrop-blur-sm"
					transition:fade
				>
					<div class="flex flex-col items-center justify-center text-center">
						<Loader2 size={32} class="animate-spin text-indigo-400" />
						<p class="mt-4 text-sm text-slate-400">Fetching map details...</p>
					</div>
				</div>
			{:else if currentCountryName}
				<div
					class="overflow-hidden rounded-xl border border-indigo-500/30 bg-indigo-500/5"
					transition:fade
				>
					<div class="border-b border-indigo-500/20 bg-indigo-500/10 px-4 py-3">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								{#if isDownloading}
									<Loader2 size={16} class="animate-spin text-indigo-400" />
								{:else}
									<MapIcon size={16} class="text-indigo-400" />
								{/if}
								<span class="text-xs font-bold tracking-wider text-indigo-300 uppercase">
									{#if isDownloading}
										Downloading
									{:else}
										Downloaded
									{/if}
									On Device
								</span>
							</div>
							{#if isDownloading}
								<div
									class="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-200"
								>
									Downloading {downloadProgress}
								</div>
							{:else}
								<div
									class="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-200"
								>
									Last Updated {formatTimeAgo(downloadedDateParam)}
								</div>
							{/if}
						</div>
					</div>
					<div class="p-4">
						<div class="flex items-start justify-between gap-4">
							<div>
								<h3 class="text-lg font-bold text-white">
									{deviceState.selectedDeviceId
										? getParamValue(deviceState.selectedDeviceId, 'OsmLocationTitle') ||
											currentCountryName
										: currentCountryName}
								</h3>
								{#if currentStateName}
									<p class="mt-1 text-sm font-medium text-slate-400">
										{deviceState.selectedDeviceId
											? getParamValue(deviceState.selectedDeviceId, 'OsmStateTitle') ||
												currentStateName
											: currentStateName}
									</p>
								{/if}
							</div>
						</div>

						<div class="mt-6 flex flex-col gap-3 sm:flex-row">
							<button
								class="btn flex-1 border-[#334155] bg-[#0f1726] text-xs font-medium text-slate-300 btn-sm hover:border-indigo-500 hover:text-white"
								onclick={handleCheckForUpdates}
								disabled={isDownloading}
							>
								<RefreshCw size={14} />
								Check for Updates
							</button>
						</div>
					</div>
				</div>
			{:else}
				<div class="rounded-xl border border-[#334155] bg-[#1e293b]/50 p-8 backdrop-blur-sm">
					<div class="flex flex-col items-center justify-center text-center" transition:fade>
						<div class="mb-3 rounded-full bg-slate-800 p-3">
							<MapIcon class="h-6 w-6 text-slate-500" />
						</div>
						<p class="text-sm text-slate-400">No offline map downloaded on this device</p>
					</div>
				</div>
			{/if}

			<!-- Configuration/Download Form -->
			<div class="rounded-xl border border-[#334155] bg-[#1e293b]/50 p-6 backdrop-blur-sm">
				<div class="mb-6 flex items-center justify-between">
					<h3 class="font-medium text-white">Download New Map</h3>
				</div>

				<div class="space-y-4">
					<div class="form-control">
						<ComboBox
							label="Country"
							placeholder="Select a country"
							options={countries.map((c) => ({ value: c.ref, label: c.display_name }))}
							bind:value={selectedCountry}
							disabled={isDownloading || loadingRegions}
						/>
					</div>

					{#if selectedCountry === 'US'}
						<div class="form-control" transition:fade>
							<ComboBox
								label="State"
								placeholder="Select a state"
								options={states.map((s) => ({ value: s.ref, label: s.display_name }))}
								bind:value={selectedState}
								disabled={isDownloading || loadingRegions}
							/>
						</div>
					{/if}

					<div class="flex flex-col gap-3 pt-4 sm:flex-row">
						<button
							class="btn w-full border-none bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700"
							disabled={!selectedCountry ||
								(selectedCountry === 'US' && !selectedState) ||
								isDownloading}
							onclick={handleSaveAndDownload}
						>
							{#if downloading}
								<Loader2 size={18} class="animate-spin" />
							{:else}
								<Download size={18} />
							{/if}
							Download Map
						</button>
					</div>

					{#if selectedCountry === 'US' && !selectedState}
						<p class="flex items-center gap-1 text-xs text-amber-400">
							<AlertCircle size={12} />
							State selection is required for US maps
						</p>
					{/if}
					<p class="text-xs text-slate-500">
						Map downloads can be large (up to several GB). Wi-Fi connection is recommended.
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>
