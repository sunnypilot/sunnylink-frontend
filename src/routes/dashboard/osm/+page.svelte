<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Map as MapIcon, Download, Trash2, AlertCircle, Loader2, RefreshCw } from 'lucide-svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { setDeviceParams, checkDeviceStatus } from '$lib/api/device';
	import { v1Client } from '$lib/api/client';
	import { logtoClient, authState } from '$lib/logto/auth.svelte';
	import { decodeParamValue } from '$lib/utils/device';
	import type { OSMRegion } from '$lib/types/osm';
	import { toastState } from '$lib/stores/toast.svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import ComboBox from '$lib/components/ComboBox.svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import DashboardSkeleton from '../DashboardSkeleton.svelte';

	let countries: OSMRegion[] = $state([]);
	let states: OSMRegion[] = $state([]);
	let loadingRegions = $state(false);
	let downloading = $state(false);
	let isDeleting = $state(false);
	let showDeleteConfirm = $state(false);
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
		if (deviceId && authState.isAuthenticated) {
			untrack(() => {
				const status = deviceState.onlineStatuses[deviceId];
				if (status === undefined || status === 'offline') {
					loadingOsmParams = true;
					logtoClient?.getIdToken().then((token) => {
						if (token && deviceState.selectedDeviceId === deviceId) {
							checkDeviceStatus(deviceId, token).finally(() => {
								if (deviceState.selectedDeviceId === deviceId) {
									fetchOsmParams(deviceId, token);
								} else {
									loadingOsmParams = false;
								}
							});
						} else {
							loadingOsmParams = false;
						}
					});
				} else if (status === 'online') {
					// Refresh params if online (checkDeviceStatus not needed)
					loadingOsmParams = true;
					logtoClient?.getIdToken().then((token) => {
						if (token && deviceState.selectedDeviceId === deviceId) {
							fetchOsmParams(deviceId, token);
						} else {
							loadingOsmParams = false;
						}
					});
				}
			});
		}
	});

	async function fetchOsmParams(deviceId: string, token: string) {
		loadingOsmParams = true;
		try {
			const res = await v1Client.GET('/v1/settings/{deviceId}/values', {
				params: {
					path: { deviceId },
					query: {
						paramKeys: [
							'OsmLocationName',
							'OsmLocationTitle',
							'OsmStateName',
							'OsmStateTitle',
							'OsmDownloadedDate',
							'OSMDownloadProgress',
							'OsmDbUpdatesCheck'
						]
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

				// Create new list: filter out old versions of these keys, then append new ones
				const keysToUpdate = new Set([
					'OsmLocationName',
					'OsmLocationTitle',
					'OsmStateName',
					'OsmStateTitle',
					'OSMDownloadProgress',
					'OsmDbUpdatesCheck',
					'OsmDownloadedDate'
				]);

				const filtered = existing.filter((i) => !keysToUpdate.has(i.key));
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
	let isDownloading = $derived.by(() => {
		if (dbUpdatesCheck === '1' || dbUpdatesCheck === true || dbUpdatesCheck === 'true') return true;
		// Try to parse progress if it exists
		if (downloadProgressParam) {
			try {
				const prog =
					typeof downloadProgressParam === 'string'
						? JSON.parse(downloadProgressParam)
						: downloadProgressParam;
				return prog.total_files > 0 && prog.downloaded_files < prog.total_files;
			} catch {}
		}
		return false;
	});

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
			const interval = setInterval(() => {
				if (deviceState.selectedDeviceId && token && downloading) {
					fetchOsmParams(deviceState.selectedDeviceId, token);
				} else {
					clearInterval(interval);
				}
			}, 3000);
		} catch (e) {
			console.error('Failed to start download', e);
			toastState.show('Failed to start download', 'error');
		} finally {
			downloading = false;
		}
	}

	async function handleDeleteMaps() {
		showDeleteConfirm = true;
	}

	async function confirmDeleteMaps() {
		if (!deviceState.selectedDeviceId || !logtoClient) return;

		const token = await logtoClient.getIdToken();
		if (!token) return;

		isDeleting = true;
		try {
			const paramsToSet = [
				{ key: 'OsmLocationName', value: '' },
				{ key: 'OsmLocationTitle', value: '' },
				{ key: 'OsmStateName', value: '' },
				{ key: 'OsmStateTitle', value: '' },
				{ key: 'OsmLocal', value: '0' },
				{ key: 'OsmDownloadedDate', value: '' }
			];

			await setDeviceParams(deviceState.selectedDeviceId, paramsToSet, token);

			selectedCountry = '';
			selectedState = '';
			toastState.show('Map configuration cleared', 'success');
			showDeleteConfirm = false;
			setTimeout(() => {
				if (deviceState.selectedDeviceId && token)
					fetchOsmParams(deviceState.selectedDeviceId, token);
			}, 2000);
		} catch (e) {
			toastState.show('Failed to delete maps', 'error');
		} finally {
			isDeleting = false;
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
				<h1 class="text-2xl font-bold text-white">Maps & Navigation</h1>
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
		<div class="rounded-xl border border-[#334155] bg-[#1e293b]/50 p-6 backdrop-blur-sm">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="font-medium text-white">Current Map</h3>
				{#if currentCountryName && !loadingOsmParams}
					<div class="text-xs text-slate-400">
						Last updated: <span class="text-slate-300">{formatTimeAgo(downloadedDateParam)}</span>
					</div>
				{/if}
			</div>

			{#if loadingOsmParams}
				<div class="flex flex-col items-center justify-center py-8 text-center" transition:fade>
					<Loader2 size={32} class="animate-spin text-indigo-400" />
					<p class="mt-4 text-sm text-slate-400">Fetching map details...</p>
				</div>
			{:else if currentCountryName}
				<!-- Current Map Details -->
				<div
					class="mb-6 flex items-center gap-3 rounded-lg border border-[#334155] bg-[#0f1726] p-4"
					transition:fade
				>
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-400"
					>
						<MapIcon size={20} />
					</div>
					<div class="flex-1">
						<p class="text-sm font-medium text-white">
							{deviceState.selectedDeviceId
								? getParamValue(deviceState.selectedDeviceId, 'OsmLocationTitle') ||
									currentCountryName
								: currentCountryName}
						</p>
						{#if currentStateName}
							<p class="text-sm font-medium text-slate-500">
								{deviceState.selectedDeviceId
									? getParamValue(deviceState.selectedDeviceId, 'OsmStateTitle') || currentStateName
									: currentStateName}
							</p>
						{/if}
					</div>
					{#if isDownloading}
						<span
							class="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400"
						>
							<Loader2 size={12} class="animate-spin" />
							Updating
						</span>
					{/if}
				</div>

				<div class="flex flex-col gap-3 sm:flex-row" transition:fade>
					<button
						class="btn flex-1 border-[#334155] bg-[#0f1726] text-sm font-medium text-slate-300 hover:border-indigo-500 hover:text-white"
						onclick={handleCheckForUpdates}
						disabled={isDownloading}
					>
						<RefreshCw size={18} />
						Check for Updates
					</button>

					<button
						class="btn flex-1 border-[#334155] bg-[#0f1726] text-sm font-medium text-red-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-500"
						onclick={handleDeleteMaps}
						disabled={isDownloading}
					>
						<Trash2 size={18} />
						Delete Map
					</button>
				</div>
			{:else}
				<div class="flex flex-col items-center justify-center py-8 text-center" transition:fade>
					<div class="mb-3 rounded-full bg-slate-800 p-3">
						<MapIcon class="h-6 w-6 text-slate-500" />
					</div>
					<p class="text-sm text-slate-400">No offline map downloaded on this device</p>
				</div>
			{/if}
		</div>

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
	{/if}

	<ConfirmationModal
		bind:open={showDeleteConfirm}
		title="Delete Maps"
		message="Are you sure you want to delete all downloaded maps? This action cannot be undone."
		confirmText="Delete Maps"
		variant="danger"
		onConfirm={confirmDeleteMaps}
		isProcessing={isDeleting}
	/>
</div>
