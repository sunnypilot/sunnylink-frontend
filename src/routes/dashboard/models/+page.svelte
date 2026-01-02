<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { getAllSettings } from '$lib/utils/settings';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { v0Client, v1Client } from '$lib/api/client';
	import { checkDeviceStatus } from '$lib/api/device';
	import { isModelManifest, type ModelBundle } from '$lib/types/models';
	import { SETTINGS_DEFINITIONS, type ExtendedDeviceParamKey } from '$lib/types/settings';
	import { deviceState } from '$lib/stores/device.svelte';
	import DashboardSkeleton from '../DashboardSkeleton.svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import ForceOffroadModal from '$lib/components/ForceOffroadModal.svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import {
		AlertTriangle,
		ShieldAlert,
		ChevronRight,
		Folder,
		Check,
		X,
		Search,
		Smartphone,
		RotateCcw,
		Star,
		CircleHelp,
		Trash2,
		RefreshCw
	} from 'lucide-svelte';
	import { slide, fade, fly } from 'svelte/transition';
	import { toastState } from '$lib/stores/toast.svelte';

	const DEFAULT_MODEL: ModelBundle = {
		short_name: 'default',
		display_name: 'Default Model',
		is_20hz: false,
		ref: 'default',
		environment: 'N/A',
		models: []
	};

	let { data } = $props();
	let modelList = $state<ModelBundle[] | undefined>();
	let currentModelShortName = $state<string | undefined>(undefined);
	let selectedModelShortName = $state<string | undefined>(undefined);
	let searchQuery = $state('');
	let lastSearchQuery = '';

	let loadingModels = $state(false);
	let sendingModel = $state(false);
	let updatingFavShortName = $state<string | null>(null);
	let favorites = $state<Set<string>>(new Set());
	let cameraOffsetValue = $state<number | undefined>(undefined);
	let settingCameraOffset = $state(false);

	let cameraOffsetParam = $derived.by(() => {
		const deviceId = deviceState.selectedDeviceId;
		if (!deviceId) return undefined;
		const deviceDef = deviceState.deviceSettings[deviceId]?.find((s) => s.key === 'CameraOffset');
		const staticDef = SETTINGS_DEFINITIONS.find((s) => s.key === 'CameraOffset');
		if (!deviceDef && !staticDef) return undefined;
		return {
			...staticDef,
			...deviceDef,
			_extra: deviceDef?._extra
		};
	});

	let currentModel = $derived(
		modelList?.find((m) => m.short_name === currentModelShortName) ??
			(currentModelShortName === undefined && !loadingModels && modelList
				? DEFAULT_MODEL
				: undefined)
	);
	let selectedModel = $derived(modelList?.find((m) => m.short_name === selectedModelShortName));

	let isOffroad = $derived(
		deviceState.selectedDeviceId
			? (deviceState.offroadStatuses[deviceState.selectedDeviceId]?.isOffroad ?? false)
			: false
	);
	let forceOffroadModalOpen = $state(false);
	let resetModalOpen = $state(false);
	let clearCacheModalOpen = $state(false);
	let clearingCache = $state(false);

	let isOffline = $derived(
		deviceState.selectedDeviceId &&
			deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'offline'
	);

	let isError = $derived(
		deviceState.selectedDeviceId &&
			deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'error'
	);

	let isCheckingStatus = $derived(
		deviceState.selectedDeviceId &&
			(deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'loading' ||
				deviceState.onlineStatuses[deviceState.selectedDeviceId] === undefined)
	);

	// Group models by folder
	let groupedModels = $derived.by(() => {
		if (!modelList) return [];

		const groups: Record<string, ModelBundle[]> = {};
		const favModels: ModelBundle[] = [];

		for (const model of modelList) {
			const matchesSearch =
				!searchQuery ||
				model.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				model.short_name.toLowerCase().includes(searchQuery.toLowerCase());

			if (!matchesSearch) continue;

			// Add to favorites group if applicable
			if (favorites.has(model.ref)) {
				favModels.push(model);
			}

			const folder = model.overrides?.folder || 'Uncategorized';
			if (!groups[folder]) {
				groups[folder] = [];
			}
			groups[folder].push(model);
		}

		const result = Object.entries(groups)
			.map(([name, models]) => {
				// Sort models by index descending within the folder
				models.sort((a, b) => (b.index ?? -1) - (a.index ?? -1));

				// The max index of the folder is the index of the first model (since we just sorted)
				const maxIndex = models.length > 0 ? (models[0]?.index ?? -1) : -1;

				return {
					name,
					models,
					maxIndex
				};
			})
			.sort((a, b) => {
				// Sort folders by their maxIndex descending
				return b.maxIndex - a.maxIndex;
			});

		// Insert Favorites folder at the top if it has models
		if (favModels.length > 0) {
			favModels.sort((a, b) => (b.index ?? -1) - (a.index ?? -1));
			result.unshift({
				name: 'Favorites',
				models: favModels,
				maxIndex: 999999 // Ensure it stays at the top if we used index sorting, but unshift does it anyway
			});
		}

		return result;
	});

	let openFolders = $state<Record<string, boolean>>({});

	function toggleFolder(name: string) {
		openFolders[name] = !openFolders[name];
	}

	// Auto-expand folder for the matches if search is active
	$effect(() => {
		if (searchQuery && modelList) {
			const q = searchQuery.toLowerCase();
			const nextOpen: Record<string, boolean> = {};
			modelList.forEach((m) => {
				if (m.display_name.toLowerCase().includes(q) || m.short_name.toLowerCase().includes(q)) {
					const folder = m.overrides?.folder || 'Uncategorized';
					nextOpen[folder] = true;
					if (favorites.has(m.ref)) {
						nextOpen['Favorites'] = true;
					}
				}
			});
			openFolders = nextOpen;
			lastSearchQuery = searchQuery;
		} else if (!searchQuery && lastSearchQuery !== '') {
			openFolders = {};
			lastSearchQuery = '';
		}
	});

	// Check status on mount / device change if not already online
	$effect(() => {
		const deviceId = deviceState.selectedDeviceId;
		if (deviceId && authState.isAuthenticated) {
			untrack(() => {
				const status = deviceState.onlineStatuses[deviceId];
				if (status === undefined || status === 'offline') {
					logtoClient?.getIdToken().then((token) => {
						if (token && deviceState.selectedDeviceId === deviceId) {
							checkDeviceStatus(deviceId, token);
						}
					});
				}
			});
		}
	});

	// Auto-refresh when device comes online
	$effect(() => {
		if (
			deviceState.selectedDeviceId &&
			deviceState.onlineStatuses[deviceState.selectedDeviceId] === 'online'
		) {
			fetchModelsForDevice();
		}
	});

	async function fetchModelsForDevice(silent = false) {
		if (!silent) {
			// Don't clear modelList here to avoid UI flickering ("keep-alive" pattern)
			currentModelShortName = undefined;
			selectedModelShortName = undefined;
			loadingModels = true;
		}
		// isOffroad is derived, no need to reset local state

		if (!logtoClient) return;
		if (!deviceState.selectedDeviceId) return;
		try {
			const models = await v1Client.GET('/v1/settings/{deviceId}/values', {
				params: {
					path: {
						deviceId: deviceState.selectedDeviceId
					},
					query: {
						paramKeys: [
							'ModelManager_ModelsCache',
							'ModelManager_ActiveBundle',
							'IsOffroad',
							'OffroadMode',
							'ModelManager_Favs',
							'CameraOffset'
						]
					}
				},
				headers: {
					Authorization: `Bearer ${await logtoClient.getIdToken()}`
				}
			});

			if (models.data?.items) {
				const modelsCacheParam = models.data.items.find(
					(i) => i.key === 'ModelManager_ModelsCache'
				);
				const activeBundleParam = models.data.items.find(
					(i) => i.key === 'ModelManager_ActiveBundle'
				);
				const isOffroadParam = models.data.items.find((i) => i.key === 'IsOffroad');
				const offroadModeParam = models.data.items.find((i) => i.key === 'OffroadMode');
				const favsParam = models.data.items.find((i) => i.key === 'ModelManager_Favs');
				const cameraOffsetItem = models.data.items.find((i) => i.key === 'CameraOffset');

				if (cameraOffsetItem) {
					const val = decodeParamValue(cameraOffsetItem);
					const num = parseFloat(String(val));
					if (!isNaN(num)) {
						cameraOffsetValue = num;
					}
				}

				if (favsParam) {
					const decodedFavs = decodeParamValue(favsParam);
					if (typeof decodedFavs === 'string') {
						favorites = new Set(decodedFavs.split(';').filter((f) => f.length > 0));
					}
				}

				let isOffroadVal = false;
				if (isOffroadParam) {
					const val = decodeParamValue(isOffroadParam);
					// IsOffroad is usually "1" or "0" or boolean
					isOffroadVal = val === '1' || val === 1 || val === true || val === 'true';
				}

				let forceOffroad = false;
				if (offroadModeParam) {
					const val = decodeParamValue(offroadModeParam);
					forceOffroad = val === '1' || val === 1 || val === true || val === 'true';
				}

				// Update global state
				if (deviceState.selectedDeviceId) {
					deviceState.offroadStatuses[deviceState.selectedDeviceId] = {
						isOffroad: isOffroadVal,
						forceOffroad
					};
				}

				if (modelsCacheParam) {
					const decodedValue = decodeParamValue(modelsCacheParam);
					if (isModelManifest(decodedValue)) {
						modelList = decodedValue.bundles;
					}
				}

				if (activeBundleParam) {
					let decodedValue = decodeParamValue(activeBundleParam);

					// If it's a string, try to parse it as JSON
					if (typeof decodedValue === 'string') {
						try {
							decodedValue = JSON.parse(decodedValue);
						} catch (e) {
							console.warn('Failed to parse Active Bundle string as JSON:', e);
						}
					}

					// The active bundle is just a ModelBundle object, not a manifest
					// We can check if it has a short_name or internalName
					if (typeof decodedValue === 'object' && decodedValue !== null) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const bundle = decodedValue as any;
						if ('short_name' in bundle) {
							currentModelShortName = bundle.short_name;
						} else if ('internalName' in bundle) {
							currentModelShortName = bundle.internalName;
						} else {
							currentModelShortName = undefined;
						}
					} else {
						currentModelShortName = undefined;
					}
				} else {
					currentModelShortName = undefined;
				}
			}
		} catch (e) {
			console.error('Error fetching models:', e);
		} finally {
			loadingModels = false;
		}
	}

	async function recheckStatus() {
		if (!deviceState.selectedDeviceId || !logtoClient) return;
		const token = await logtoClient.getIdToken();
		if (token) {
			await checkDeviceStatus(deviceState.selectedDeviceId, token);
			await fetchModelsForDevice();
		}
	}

	async function refreshModels() {
		if (!logtoClient || !deviceState.selectedDeviceId) return;

		try {
			loadingModels = true;
			const token = await logtoClient.getIdToken();

			// 1. Clear the last update time to force a refresh
			await v0Client.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: deviceState.selectedDeviceId
					}
				},
				body: [
					{
						key: 'ModelManager_LastSyncTime',
						value: encodeParamValue({
							key: 'ModelManager_LastSyncTime',
							value: '0',
							type: 'String'
						})
					}
				],
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			// 2. Wait a moment for the device to process and potentially update
			// We can't really know when it's done, but giving it a few seconds helps.
			// Ideally we would poll ModelManager_LastSyncTime, but for now a delay + fetch is a good start.
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// 3. Fetch the fresh list
			await fetchModelsForDevice(true);
		} catch (e) {
			console.error('Error refreshing models:', e);
		} finally {
			loadingModels = false;
		}
	}

	async function pushModelToDevice(bundle: ModelBundle) {
		if (!logtoClient) return;
		if (!deviceState.selectedDeviceId) return;

		try {
			sendingModel = true;

			// Pre-push check: Verify IsOffroad is still true
			const token = await logtoClient.getIdToken();
			if (!token) throw new Error('Not authenticated');
			const statusRes = await v1Client.GET('/v1/settings/{deviceId}/values', {
				params: {
					path: { deviceId: deviceState.selectedDeviceId },
					query: { paramKeys: ['IsOffroad'] }
				},
				headers: { Authorization: `Bearer ${token}` }
			});

			const isOffroadParam = statusRes.data?.items?.find((i) => i.key === 'IsOffroad');
			let currentIsOffroad = false;
			if (isOffroadParam) {
				const val = decodeParamValue(isOffroadParam);
				currentIsOffroad = val === '1' || val === 1 || val === true || val === 'true';
			}

			if (!currentIsOffroad) {
				// Update global state to reflect reality
				if (deviceState.selectedDeviceId) {
					deviceState.offroadStatuses[deviceState.selectedDeviceId] = {
						isOffroad: false,
						forceOffroad:
							deviceState.offroadStatuses[deviceState.selectedDeviceId]?.forceOffroad ?? false
					};
				}
				throw new Error('Device is Onroad. Cannot push model.');
			}

			const params = [];
			if (bundle.short_name === 'default') {
				params.push({
					key: 'ModelManager_ActiveBundle',
					value: encodeParamValue({
						key: 'ModelManager_ActiveBundle',
						value: '{}',
						type: 'string'
					}),
					is_compressed: false
				});
			} else {
				params.push({
					key: 'ModelManager_DownloadIndex',
					value: encodeParamValue({
						key: 'ModelManager_DownloadIndex',
						value: String(bundle.index ?? ''),
						type: 'String'
					}),
					is_compressed: false
				});
			}

			await v0Client.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: deviceState.selectedDeviceId
					}
				},
				body: params,
				headers: {
					Authorization: `Bearer ${await logtoClient.getIdToken()}`
				}
			});

			// On success, update the current model and clear selection
			currentModelShortName = bundle.short_name === 'default' ? undefined : bundle.short_name;
			selectedModelShortName = undefined;
			sendingModel = false;

			// Refresh status silently
			fetchModelsForDevice(true);
		} catch (e) {
			console.error('Error sending model to device:', e);
		} finally {
			sendingModel = false;
		}
	}

	async function sendModelToDevice() {
		if (selectedModel) {
			await pushModelToDevice(selectedModel);
		}
	}

	async function resetToDefaultModel() {
		await pushModelToDevice(DEFAULT_MODEL);
		resetModalOpen = false;
	}

	async function clearModelsCache() {
		if (!logtoClient || !deviceState.selectedDeviceId) return;

		try {
			clearingCache = true;
			await v0Client.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: deviceState.selectedDeviceId
					}
				},
				body: [
					{
						key: 'ModelManager_ClearCache',
						value: encodeParamValue({
							key: 'ModelManager_ClearCache',
							value: '1',
							type: 'bool'
						}),
						is_compressed: false
					}
				],
				headers: {
					Authorization: `Bearer ${await logtoClient.getIdToken()}`
				}
			});
			toastState.show('Models cache cleared successfully!', 'success');
		} catch (e) {
			console.error('Error clearing models cache:', e);
			toastState.show('Failed to clear models cache.', 'error');
		} finally {
			clearingCache = false;
			clearCacheModalOpen = false;
		}
	}

	async function toggleFavorite(bundle: ModelBundle, event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		if (!logtoClient || !deviceState.selectedDeviceId) return;

		const newFavorites = new Set(favorites);
		if (newFavorites.has(bundle.ref)) {
			newFavorites.delete(bundle.ref);
		} else {
			newFavorites.add(bundle.ref);
		}

		const favString = Array.from(newFavorites).join(';');

		try {
			updatingFavShortName = bundle.short_name;
			await v0Client.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: deviceState.selectedDeviceId
					}
				},
				body: [
					{
						key: 'ModelManager_Favs',
						value: encodeParamValue({
							key: 'ModelManager_Favs',
							value: favString,
							type: 'string'
						}),
						is_compressed: false
					}
				],
				headers: {
					Authorization: `Bearer ${await logtoClient.getIdToken()}`
				}
			});
			favorites = newFavorites;
		} catch (e) {
			console.error('Error updating favorites:', e);
		} finally {
			updatingFavShortName = null;
		}
	}

	const FOLDER_EXPLANATIONS: Record<string, string> = {
		release:
			'Release models are the models that made release for OpenPilot so ideally they should be what a user wants for a "stable" Experience',
		master:
			'Master models are the models that made it to OpenPilot master which every new model there should ideally be better than the prior model there.',
		pre_world:
			'These are the experimental MLSIM models that may have not made it to commas master  branch, and are considered experimental by nature',
		world:
			'These are the experimental models built using self-supervision & world-model that may have not made it to commas master  branch, and are considered experimental by nature',
		legacy:
			'Legacy models are old models that users may want to drive but these are considered less context aware of the environment and may not provide the best experience.',
		custom:
			'Custom merge models are sunnypilot experimental models created by discounchubbs by merging together weights of diferent upstream models.'
	};

	function getFolderExplanation(name: string) {
		const lowerName = name.toLowerCase();
		for (const [key, explanation] of Object.entries(FOLDER_EXPLANATIONS)) {
			if (lowerName.includes(key.toLowerCase().replace('_', ' '))) {
				return explanation;
			}
		}
		return null;
	}
</script>

<div class="space-y-6">
	<div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center sm:gap-0">
		<div>
			<h1 class="text-2xl font-bold text-white">Models</h1>
			<p class="text-slate-400">Manage and switch driving models for your device.</p>
		</div>

		<div class="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
			<button
				class="btn border-red-500/30 bg-red-500/10 text-red-400 transition-all btn-md hover:border-red-500/50 hover:bg-red-500/20 active:scale-95 disabled:opacity-50"
				onclick={() => (clearCacheModalOpen = true)}
				disabled={clearingCache || sendingModel || loadingModels || !isOffroad}
			>
				{#if clearingCache}
					<span class="loading loading-xs loading-spinner"></span>
				{:else}
					<Trash2 size={14} class="mr-1.5" />
				{/if}
				Clear Cache
			</button>
			{#if currentModelShortName !== undefined && (!loadingModels || modelList)}
				<button
					class="btn border-slate-700 bg-slate-800 text-slate-200 transition-all btn-md hover:border-slate-600 hover:bg-slate-700 active:scale-95 disabled:opacity-50"
					onclick={() => (resetModalOpen = true)}
					disabled={sendingModel || clearingCache || loadingModels || !isOffroad}
				>
					{#if sendingModel}
						<span class="loading loading-xs loading-spinner"></span>
					{:else}
						<RotateCcw size={14} class="mr-1.5" />
					{/if}
					Reset to Default Model
				</button>
			{/if}
		</div>
	</div>

	{#if authState.loading}
		<DashboardSkeleton />
	{:else if !deviceState.selectedDeviceId}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<div class="mb-4 rounded-full bg-slate-700/50 p-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-12 w-12 text-slate-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
					/>
				</svg>
			</div>
			<h3 class="text-xl font-semibold text-white">No Device Selected</h3>
			<p class="mt-2 text-slate-400">Select a device to view available models.</p>
		</div>
	{:else if isOffline}
		{#await data.streamed.devices then devices}
			{@const selectedDevice = devices?.find(
				(d: { device_id: string | null }) => d.device_id === deviceState.selectedDeviceId
			)}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="mb-4 rounded-full bg-red-500/10 p-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-12 w-12 text-red-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
						/>
					</svg>
				</div>
				<h3 class="text-xl font-semibold text-white">
					Device Offline: {selectedDevice?.alias ?? selectedDevice?.device_id ?? 'Unknown'}
					{#if selectedDevice?.alias}
						<span class="block text-sm font-normal text-slate-400"
							>({selectedDevice?.device_id})</span
						>
					{/if}
				</h3>
				<p class="mt-2 max-w-md text-slate-400">
					Your device needs to be online to fetch and manage models.
				</p>
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
	{:else if (loadingModels || isCheckingStatus) && !modelList}
		<div class="animate-pulse space-y-6">
			{#if isCheckingStatus}
				<div class="flex items-center gap-2 text-slate-400">
					<span class="loading loading-sm loading-spinner"></span>
					<span>Checking device status...</span>
				</div>
			{/if}
			<div class="h-12 w-full rounded bg-slate-700"></div>
			<div class="h-48 w-full rounded bg-slate-700"></div>
		</div>
	{:else if isError}
		{#await data.streamed.devices then devices}
			{@const selectedDevice = devices?.find(
				(d: { device_id: string | null }) => d.device_id === deviceState.selectedDeviceId
			)}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="mb-4 rounded-full bg-amber-500/10 p-4">
					<!-- AlertTriangle is already imported -->
					<AlertTriangle class="h-12 w-12 text-amber-500" />
				</div>
				<h3 class="text-xl font-semibold text-white">Connection Error</h3>
				<p class="mt-2 max-w-md text-slate-400">
					{deviceState.lastErrorMessages[deviceState.selectedDeviceId || ''] ||
						'Failed to connect to device.'}
				</p>
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
	{:else}
		<div class="space-y-6">
			{#if currentModel}
				<div class="overflow-hidden rounded-xl border border-violet-500/30 bg-violet-500/5">
					<div class="border-b border-violet-500/20 bg-violet-500/10 px-4 py-3">
						<div class="flex items-center gap-2">
							<Smartphone size={16} class="text-violet-400" />
							<span class="text-xs font-bold tracking-wider text-violet-300 uppercase">
								Active On Device
							</span>
						</div>
					</div>
					<div class="p-4">
						<div class="flex items-start justify-between gap-4">
							<div>
								<h3 class="text-lg font-bold text-white">{currentModel.display_name}</h3>
								<code
									class="mt-1 inline-block rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-xs text-violet-300"
								>
									{currentModel.short_name}
								</code>
							</div>
							<div
								class="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-medium text-violet-200"
							>
								Active
							</div>
						</div>
						<div class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
							<div>
								<span class="block text-xs font-medium text-slate-500 uppercase">Environment</span>
								<span class="text-slate-300">{currentModel.environment}</span>
							</div>
							<div>
								<span class="block text-xs font-medium text-slate-500 uppercase">Generation</span>
								<span class="text-slate-300">{currentModel.generation ?? 'N/A'}</span>
							</div>
							<div>
								<span class="block text-xs font-medium text-slate-500 uppercase">Runner</span>
								<span class="text-slate-300">{currentModel.runner ?? 'N/A'}</span>
							</div>
							<div>
								<span class="block text-xs font-medium text-slate-500 uppercase">Build Date</span>
								<span class="text-slate-300">
									{currentModel.build_time
										? new Date(currentModel.build_time).toLocaleDateString()
										: 'N/A'}
								</span>
							</div>
						</div>
					</div>
				</div>
			{/if}

			{#if currentModel !== DEFAULT_MODEL && cameraOffsetParam}
				{@const min = cameraOffsetParam._extra?.min ?? -1}
				{@const max = cameraOffsetParam._extra?.max ?? 1}
				{@const step = cameraOffsetParam._extra?.step ?? 0.01}
				{@const title = cameraOffsetParam._extra?.title ?? cameraOffsetParam.label}
				{@const description =
					cameraOffsetParam._extra?.description ?? cameraOffsetParam.description}

				<div class="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
					<div class="border-b border-slate-700 bg-slate-800/50 px-4 py-3">
						<div class="flex items-center gap-2">
							<RotateCcw size={16} class="text-slate-400" />
							<span class="text-xs font-bold tracking-wider text-slate-300 uppercase">
								Calibration
							</span>
						</div>
					</div>
					<div class="p-4">
						<div class="flex w-full flex-col gap-2">
							<div class="flex items-center justify-between">
								<div>
									<h3 class="font-medium text-white">{title}</h3>
									<p class="text-xs text-slate-400">{description}</p>
								</div>
								<div class="flex items-center gap-3">
									<span class="text-xs font-medium text-slate-400">{min.toFixed(2)}</span>
									<span class="font-mono text-lg font-bold text-primary">
										{cameraOffsetValue?.toFixed(2) ?? '0.00'}
									</span>
									<span class="text-xs font-medium text-slate-400">{max.toFixed(2)}</span>
								</div>
							</div>
							<div class="mt-2 flex items-center gap-4">
								<button
									class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
									aria-label="Decrease value"
									disabled={settingCameraOffset}
									onclick={async () => {
										if (
											cameraOffsetValue !== undefined &&
											logtoClient &&
											deviceState.selectedDeviceId
										) {
											const newValue = Math.max(min, cameraOffsetValue - step);
											cameraOffsetValue = newValue;
											settingCameraOffset = true;
											try {
												await v0Client.POST('/settings/{deviceId}', {
													params: {
														path: {
															deviceId: deviceState.selectedDeviceId
														}
													},
													body: [
														{
															key: 'CameraOffset',
															value: encodeParamValue({
																key: 'CameraOffset',
																value: newValue,
																type: 'Float'
															}),
															is_compressed: false
														}
													],
													headers: {
														Authorization: `Bearer ${await logtoClient.getIdToken()}`
													}
												});
												// await fetchModelsForDevice(true); // Maybe not needed for just visual update if we trust local state
											} catch (e) {
												console.error('Error setting CameraOffset', e);
											} finally {
												settingCameraOffset = false;
											}
										}
									}}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="20"
										height="20"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M5 12h14" /></svg
									>
								</button>
								<input
									type="range"
									{min}
									{max}
									{step}
									value={cameraOffsetValue ?? 0}
									class="range flex-1 range-primary range-xs"
									disabled={settingCameraOffset}
									oninput={async (e) => {
										const val = parseFloat(e.currentTarget.value);
										cameraOffsetValue = val;
									}}
									onchange={async (e) => {
										const val = parseFloat(e.currentTarget.value);
										if (logtoClient && deviceState.selectedDeviceId) {
											settingCameraOffset = true;
											try {
												await v0Client.POST('/settings/{deviceId}', {
													params: {
														path: {
															deviceId: deviceState.selectedDeviceId
														}
													},
													body: [
														{
															key: 'CameraOffset',
															value: encodeParamValue({
																key: 'CameraOffset',
																value: val,
																type: 'Float'
															}),
															is_compressed: false
														}
													],
													headers: {
														Authorization: `Bearer ${await logtoClient.getIdToken()}`
													}
												});
											} catch (e) {
												console.error('Error setting CameraOffset', e);
											} finally {
												settingCameraOffset = false;
											}
										}
									}}
								/>
								<button
									class="btn btn-circle text-slate-400 btn-ghost btn-sm hover:text-white"
									aria-label="Increase value"
									disabled={settingCameraOffset}
									onclick={async () => {
										if (
											cameraOffsetValue !== undefined &&
											logtoClient &&
											deviceState.selectedDeviceId
										) {
											const newValue = Math.min(max, cameraOffsetValue + step);
											cameraOffsetValue = newValue;
											settingCameraOffset = true;
											try {
												await v0Client.POST('/settings/{deviceId}', {
													params: {
														path: {
															deviceId: deviceState.selectedDeviceId
														}
													},
													body: [
														{
															key: 'CameraOffset',
															value: encodeParamValue({
																key: 'CameraOffset',
																value: newValue,
																type: 'Float'
															}),
															is_compressed: false
														}
													],
													headers: {
														Authorization: `Bearer ${await logtoClient.getIdToken()}`
													}
												});
											} catch (e) {
												console.error('Error setting CameraOffset', e);
											} finally {
												settingCameraOffset = false;
											}
										}
									}}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="20"
										height="20"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg
									>
								</button>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<div class="space-y-3">
				<div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
					<div class="label px-0">
						<span
							class="label-text text-sm font-semibold tracking-[0.28em] text-slate-400 uppercase"
							>Available Models</span
						>
					</div>
					<div
						class="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center"
					>
						<button
							type="button"
							class="btn border-slate-700 bg-slate-800 text-slate-200 btn-ghost transition-all btn-md hover:border-slate-600 hover:bg-slate-700 active:scale-95 disabled:opacity-50"
							onclick={refreshModels}
							disabled={loadingModels}
							aria-label="Fetch Latest"
						>
							<RefreshCw size={20} class={loadingModels ? 'animate-spin' : ''} />
							Fetch Latest
						</button>
						<div class="relative w-full">
							<input
								type="text"
								placeholder="Search models..."
								class="input input-md w-full border-slate-700 bg-slate-900 pr-9 pl-10 text-slate-200 focus:border-violet-500 focus:outline-none"
								bind:value={searchQuery}
							/>
							<div
								class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3"
							>
								<Search size={14} class="text-slate-500" />
							</div>
							{#if searchQuery}
								<button
									type="button"
									class="absolute inset-y-0 right-0 z-10 flex items-center pr-3 text-slate-500 transition-colors hover:text-slate-300"
									onclick={() => {
										searchQuery = '';
									}}
									aria-label="Clear search"
								>
									<X size={14} />
								</button>
							{/if}
						</div>
					</div>
				</div>

				<div class="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-900/40">
					{#if loadingModels && modelList}
						<div
							class="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px]"
							transition:fade={{ duration: 200 }}
						>
							<span class="loading loading-lg loading-spinner text-violet-500"></span>
						</div>
					{/if}
					{#if loadingModels && !modelList}
						<div class="p-6 text-center text-slate-500">
							<span class="loading loading-spinner text-violet-500"></span>
						</div>
					{:else if groupedModels.length === 0 && searchQuery}
						<div class="p-6 text-center text-slate-500">
							No models available matching "{searchQuery}"
						</div>
					{:else}
						<div class="custom-scrollbar max-h-[calc(100vh-250px)] overflow-y-auto">
							{#each groupedModels as group (group.name)}
								<div class="border-b border-slate-700/50 last:border-0">
									<button
										class="flex w-full items-center gap-3 bg-slate-800/80 px-4 py-3 text-left transition-colors hover:bg-slate-800 focus:outline-none"
										onclick={() => toggleFolder(group.name)}
									>
										<ChevronRight
											size={16}
											class="text-slate-400 transition-transform duration-200 {openFolders[
												group.name
											]
												? 'rotate-90'
												: ''}"
										/>
										{#if group.name === 'Favorites'}
											<Star size={16} class="fill-amber-400 text-amber-400" />
										{:else}
											<Folder size={16} class="text-violet-400" />
										{/if}
										<div class="flex items-center gap-2">
											<span class="font-medium text-slate-200">{group.name}</span>
											{#if getFolderExplanation(group.name)}
												<div
													class="tooltip tooltip-right flex items-center"
													data-tip={getFolderExplanation(group.name)}
												>
													<CircleHelp
														size={14}
														class="text-slate-500 transition-colors hover:text-slate-300"
													/>
												</div>
											{/if}
										</div>
										<span
											class="ml-auto rounded-full bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400"
										>
											{group.models.length}
										</span>
									</button>

									{#if openFolders[group.name]}
										<div transition:slide={{ duration: 200 }} class="bg-slate-900/50">
											{#each group.models as model (model.short_name)}
												<div
													class="group relative flex w-full items-center justify-between px-4 py-2.5 pl-11 text-left transition-all hover:bg-slate-800/50 {selectedModelShortName ===
													model.short_name
														? 'bg-violet-500/10 hover:bg-violet-500/20'
														: ''}"
												>
													{#if selectedModelShortName === model.short_name}
														<div
															class="absolute top-0 left-0 h-full w-0.5 bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
														></div>
													{/if}

													<button
														class="flex flex-1 items-center gap-3 py-1 text-left focus:outline-none"
														onclick={() => (selectedModelShortName = model.short_name)}
													>
														<span
															class="text-sm font-medium transition-colors {selectedModelShortName ===
															model.short_name
																? 'text-violet-200'
																: 'text-slate-400 group-hover:text-slate-200'}"
														>
															{model.display_name}
														</span>
													</button>

													<div class="flex items-center gap-3">
														<button
															class="p-1.5 text-slate-500 transition-colors hover:text-amber-400 active:scale-90 disabled:opacity-50 {updatingFavShortName &&
															updatingFavShortName === model.short_name
																? 'animate-pulse-slow'
																: ''}"
															onclick={(e) => toggleFavorite(model, e)}
															disabled={updatingFavShortName !== null}
															title={favorites.has(model.ref)
																? 'Remove from Favorites'
																: 'Add to Favorites'}
														>
															<Star
																size={16}
																class={favorites.has(model.ref)
																	? 'fill-amber-400 text-amber-400'
																	: ''}
															/>
														</button>

														{#if selectedModelShortName === model.short_name}
															<Check size={16} class="text-violet-400" />
														{/if}
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>

		{#if selectedModel}
			<!-- Backdrop -->
			<button
				class="fixed inset-0 z-40 cursor-default bg-black/60 backdrop-blur-sm transition-opacity"
				transition:fade={{ duration: 200 }}
				onclick={() => {
					selectedModelShortName = undefined;
				}}
				aria-label="Close modal"
			></button>

			<!-- Modal -->
			<div
				class="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 p-4"
				transition:fly={{ y: 20, duration: 300 }}
			>
				<div
					class="relative overflow-hidden rounded-xl border border-slate-700 bg-[#0f1726] p-6 shadow-2xl"
				>
					<button
						class="absolute top-4 right-4 text-slate-400 hover:text-white"
						onclick={() => (selectedModelShortName = undefined)}
					>
						<X size={20} />
					</button>

					<div class="mb-6">
						<div class="flex items-center justify-between gap-4">
							<h3 class="text-2xl font-bold text-white">
								{selectedModel.display_name}
							</h3>
							<button
								class="rounded-full p-2 text-slate-400 transition-all hover:bg-slate-800 hover:text-amber-400 active:scale-95 disabled:opacity-50 {updatingFavShortName &&
								updatingFavShortName === selectedModel.short_name
									? 'animate-pulse-slow'
									: ''}"
								onclick={() => toggleFavorite(selectedModel!)}
								disabled={updatingFavShortName !== null}
								title={favorites.has(selectedModel.ref)
									? 'Remove from Favorites'
									: 'Add to Favorites'}
							>
								<Star
									size={24}
									class={favorites.has(selectedModel.ref) ? 'fill-amber-400 text-amber-400' : ''}
								/>
							</button>
						</div>

						<div class="mt-2">
							<code class="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-violet-300">
								{selectedModel.short_name}
							</code>
						</div>
					</div>

					<div class="mb-8 grid grid-cols-2 gap-6">
						<div>
							<div class="text-xs font-medium tracking-wider text-slate-500 uppercase">
								Environment
							</div>
							<div class="mt-1 text-sm text-slate-200">{selectedModel.environment}</div>
						</div>
						<div>
							<div class="text-xs font-medium tracking-wider text-slate-500 uppercase">
								Build Date
							</div>
							<div class="mt-1 text-sm text-slate-200">
								{selectedModel.build_time
									? new Date(selectedModel.build_time).toLocaleDateString(undefined, {
											year: 'numeric',
											month: 'short',
											day: 'numeric'
										})
									: 'Unknown'}
							</div>
						</div>
						<div>
							<div class="text-xs font-medium tracking-wider text-slate-500 uppercase">Runner</div>
							<div class="mt-1 text-sm text-slate-200">{selectedModel.runner ?? 'Unknown'}</div>
						</div>
						<div>
							<div class="text-xs font-medium tracking-wider text-slate-500 uppercase">
								Generation
							</div>
							<div class="mt-1 text-sm text-slate-200">
								{selectedModel.generation ?? 'Unknown'}
							</div>
						</div>
					</div>

					{#if !isOffroad}
						<div class="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
							<div class="flex items-start gap-3">
								<ShieldAlert class="mt-0.5 shrink-0 text-amber-500" size={20} />
								<div class="space-y-2">
									<p class="text-sm font-medium text-amber-200">Device is Onroad</p>
									<p class="text-xs text-amber-200/80">Models cannot be changed while driving.</p>
									<div class="flex flex-wrap gap-3">
										<button
											class="text-xs font-semibold text-amber-500 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-400"
											onclick={() => (forceOffroadModalOpen = true)}
										>
											Force Offroad Mode
										</button>
										<button
											class="text-xs font-semibold text-slate-400 underline decoration-slate-500/50 underline-offset-2 hover:text-slate-300"
											onclick={recheckStatus}
										>
											Recheck Status
										</button>
									</div>
								</div>
							</div>
						</div>
					{/if}

					<div class="flex gap-3">
						<button
							class="btn flex-1 border-[#334155] bg-[#1e293b] text-white hover:bg-[#334155]"
							onclick={() => (selectedModelShortName = undefined)}
						>
							Cancel
						</button>
						<button
							class="btn flex-[2] border-violet-500 bg-violet-600 text-white hover:border-violet-600 hover:bg-violet-700"
							onclick={sendModelToDevice}
							disabled={sendingModel || !selectedModel || !isOffroad}
						>
							{#if sendingModel}
								<span class="loading loading-xs loading-spinner"></span>
								Sending...
							{:else}
								Send to Device 🚀
							{/if}
						</button>
					</div>

					{#if sendingModel}
						<progress class="progress mt-4 w-full progress-primary"></progress>
					{/if}
				</div>
			</div>
		{/if}
	{/if}
</div>

<ForceOffroadModal
	bind:open={forceOffroadModalOpen}
	onSuccess={async () => {
		// Refresh status
		await recheckStatus();
	}}
/>

<ConfirmationModal
	bind:open={resetModalOpen}
	title="Reset to Default Model"
	message="Are you sure you want to reset to the default driving model? This will clear the active bundle on the device."
	confirmText="Reset to Default"
	variant="danger"
	isProcessing={sendingModel}
	onConfirm={resetToDefaultModel}
/>

<ConfirmationModal
	bind:open={clearCacheModalOpen}
	title="Clear Models Cache"
	message="Are you sure you want to clear the models cache on this device? This will remove all downloaded models except the active one."
	confirmText="Clear Cache"
	variant="danger"
	isProcessing={clearingCache}
	onConfirm={clearModelsCache}
/>

<style>
	@keyframes pulse-slow {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.5;
			transform: scale(0.9);
		}
	}

	:global(.animate-pulse-slow) {
		animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}
</style>
