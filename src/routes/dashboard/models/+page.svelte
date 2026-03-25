<script lang="ts">
	import { untrack } from 'svelte';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { v0Client } from '$lib/api/client';
	import { checkDeviceStatus, fetchSettingsAsync, fetchDeviceMessage } from '$lib/api/device';
	import { isModelManifest, type ModelBundle } from '$lib/types/models';
	import {
		SETTINGS_DEFINITIONS,
		MODEL_SETTINGS,
		type RenderableSetting
	} from '$lib/types/settings';
	import { deviceState } from '$lib/stores/device.svelte';
	import DashboardSkeleton from '../DashboardSkeleton.svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import ForceOffroadModal from '$lib/components/ForceOffroadModal.svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import SchemaItemRenderer from '$lib/components/schema/SchemaItemRenderer.svelte';
	import SchemaPanel from '$lib/components/schema/SchemaPanel.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { settingToSchemaItem } from '$lib/utils/settingAdapter';
	import SettingsActionBar from '$lib/components/SettingsActionBar.svelte';
	import PushSettingsModal from '$lib/components/PushSettingsModal.svelte';
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
		RefreshCw,
		WifiOff
	} from 'lucide-svelte';
	import { slide, fade, fly } from 'svelte/transition';
	import { createSyncStatus } from '$lib/utils/syncStatus.svelte';
	import { batchPush } from '$lib/stores/batchPush.svelte';
	import SyncStatusIndicator from '$lib/components/SyncStatusIndicator.svelte';
	import SettingsPageShell from '$lib/components/SettingsPageShell.svelte';
	import { toastState } from '$lib/stores/toast.svelte';

	const DEFAULT_MODEL: ModelBundle = {
		short_name: 'default',
		display_name: 'Default Model',
		is_20hz: false,
		ref: 'default',
		environment: 'N/A',
		models: []
	};

	const MODELS_CACHE_PREFIX = 'sunnylink_models_';
	const MODELS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

	interface ModelsCacheEntry {
		modelList: ModelBundle[];
		currentModelShortName: string | undefined;
		favorites: string[];
		timestamp: number;
	}

	function loadModelsCache(deviceId: string): ModelsCacheEntry | null {
		if (typeof localStorage === 'undefined') return null;
		try {
			const raw = localStorage.getItem(`${MODELS_CACHE_PREFIX}${deviceId}`);
			if (!raw) return null;
			const entry: ModelsCacheEntry = JSON.parse(raw);
			if (Date.now() - entry.timestamp > MODELS_CACHE_TTL) {
				localStorage.removeItem(`${MODELS_CACHE_PREFIX}${deviceId}`);
				return null;
			}
			return entry;
		} catch { return null; }
	}

	function saveModelsCache(deviceId: string, list: ModelBundle[], activeShortName: string | undefined, favs: Set<string>): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const entry: ModelsCacheEntry = {
				modelList: list,
				currentModelShortName: activeShortName,
				favorites: Array.from(favs),
				timestamp: Date.now()
			};
			localStorage.setItem(`${MODELS_CACHE_PREFIX}${deviceId}`, JSON.stringify(entry));
		} catch {}
	}

	let { data } = $props();
	let modelList = $state<ModelBundle[] | undefined>();
	let currentModelShortName = $state<string | undefined>(undefined);
	let selectedModelShortName = $state<string | undefined>(undefined);
	let searchQuery = $state('');
	let lastSearchQuery = '';

	let loadingModels = $state(false);
	let sendingModel = $state(false);
	let favorites = $state<Set<string>>(new Set());
	// Track which model refs were toggled in this batch for per-row badge display
	let toggledFavRefs = $state<Set<string>>(new Set());

	// Sync favorites from deviceValues (handles batchPush rollback + device-side changes)
	// Clear the per-row badge refs when the batch completes
	$effect(() => {
		const did = deviceState.selectedDeviceId;
		if (!did || toggledFavRefs.size === 0) return;
		const state = batchPush.getKeyState(did, 'ModelManager_Favs');
		if (!state) toggledFavRefs = new Set();
	});

	let deviceFavString = $derived(
		deviceState.selectedDeviceId
			? (deviceState.deviceValues[deviceState.selectedDeviceId]?.['ModelManager_Favs'] as string) ?? ''
			: ''
	);
	let prevDeviceFavString = $state('');
	$effect(() => {
		const current = deviceFavString;
		if (current !== prevDeviceFavString) {
			prevDeviceFavString = current;
			// Only sync from device if it wasn't our own optimistic update
			// (deviceValues is set by toggleFavorite AND by batchPush rollback/fetch)
			favorites = new Set(current ? current.split(';').filter(Boolean) : []);
		}
	});

	// Synchronous cache hydration — runs before first render, no $effect loop.
	function hydrateModelsCache(did: string) {
		if (!did || modelList) return;
		const cached = loadModelsCache(did);
		if (cached) {
			modelList = cached.modelList;
			currentModelShortName = cached.currentModelShortName;
			favorites = new Set(cached.favorites);
		}
	}

	// Hydrate immediately for current device (synchronous, before first render)
	if (deviceState.selectedDeviceId) {
		hydrateModelsCache(deviceState.selectedDeviceId);
	}

	// Re-hydrate reactively when device changes
	$effect(() => {
		const did = deviceState.selectedDeviceId;
		if (did) {
			untrack(() => hydrateModelsCache(did));
		}
	});
	let pushModalOpen = $state(false);
	let downloadingModelIndex = $state<number | undefined>(undefined);

	let lagdToggleValue = $derived(
		deviceState.selectedDeviceId
			? (deviceState.getChange(deviceState.selectedDeviceId, 'LagdToggle') ??
					deviceState.deviceValues[deviceState.selectedDeviceId]?.['LagdToggle'])
			: undefined
	);

	let laneTurnDesireParamValue = $derived(
		deviceState.selectedDeviceId
			? (deviceState.getChange(deviceState.selectedDeviceId, 'LaneTurnDesire') ??
					deviceState.deviceValues[deviceState.selectedDeviceId]?.['LaneTurnDesire'])
			: undefined
	);

	function getModelSetting(key: string) {
		const deviceId = deviceState.selectedDeviceId;
		if (!deviceId) return undefined;
		const deviceDef = deviceState.deviceSettings[deviceId!]?.find((s) => s.key === key);
		const staticDef = SETTINGS_DEFINITIONS.find((s) => s.key === key);
		if (!deviceDef && !staticDef) return undefined;
		return {
			...staticDef,
			value: deviceDef,
			key,
			_extra: deviceDef?._extra
		} as RenderableSetting;
	}

	let cameraOffsetParam = $derived(getModelSetting('CameraOffset'));
	let lagdToggleParam = $derived(getModelSetting('LagdToggle'));
	let lagdToggleDelayParam = $derived(getModelSetting('LagdToggleDelay'));
	let laneTurnDesireParam = $derived(getModelSetting('LaneTurnDesire'));
	let laneTurnValueParam = $derived(getModelSetting('LaneTurnValue'));
	let nnlcParam = $derived(getModelSetting('NeuralNetworkLateralControl'));

	let currentModel = $derived.by(() => {
		if (downloadingModelIndex !== undefined && modelList) {
			const downloadingModel = modelList.find((m) => m.index === downloadingModelIndex);
			if (downloadingModel) return downloadingModel;
		}
		if (!modelList) return undefined;
		if (currentModelShortName !== undefined) {
			return modelList.find((m) => m.short_name === currentModelShortName) ?? DEFAULT_MODEL;
		}
		// Don't flash DEFAULT_MODEL while still loading/resolving
		if (loadingModels) return undefined;
		return DEFAULT_MODEL;
	});
	let isLegacyActive = $derived(
		currentModel?.overrides?.folder?.toLowerCase().includes('legacy') ?? false
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

	// Retry state for offline/error banner (matches settings layout)
	let retrying = $state(false);
	let retryFailed = $state(false);
	let lastRetryAt = $state<Date | null>(null);

	async function handleRetry() {
		if (!deviceState.selectedDeviceId || !logtoClient) return;
		retrying = true;
		// Reset verification so sync indicator shows "Refreshing..." during retry
		deviceState.valuesVerifiedThisSession[deviceState.selectedDeviceId] = false;
		try {
			const token = await logtoClient.getIdToken();
			if (token) await checkDeviceStatus(deviceState.selectedDeviceId, token, true);
			lastRetryAt = new Date();
			// If still offline/error after retry
			const status = deviceState.onlineStatuses[deviceState.selectedDeviceId];
			retryFailed = status === 'offline' || status === 'error';
		} catch {
			retryFailed = true;
		} finally {
			retrying = false;
		}
	}

	function formatRelativeTime(date: Date): string {
		const seconds = Math.round((Date.now() - date.getTime()) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		return `${minutes}m ago`;
	}

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

	// Tracks any active fetch (silent or not) for the sync indicator
	let isFetchingModels = $state(false);

	// True only when refreshing with data already present (not cold load)
	let isRevalidating = $derived(isFetchingModels && modelList !== null);

	let batchActive = $derived(deviceState.selectedDeviceId ? batchPush.isActive(deviceState.selectedDeviceId) : false);
	const sync = createSyncStatus(
		() => isRevalidating || batchActive,
		() => !isOffline && !isError && !batchActive
	);

	// Reset on device change (skip initial mount)
	let prevDeviceId = $state(deviceState.selectedDeviceId);
	$effect(() => {
		const did = deviceState.selectedDeviceId;
		untrack(() => {
			if (did !== prevDeviceId) {
				prevDeviceId = did;
				sync.reset();
			}
		});
	});

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

	// Auto-refresh when device comes online OR immediately revalidate cached data
	// When cached data exists, fetch starts immediately (shows "Refreshing..." right away)
	// When no cache, waits for online status before cold loading
	$effect(() => {
		const did = deviceState.selectedDeviceId;
		const online = did ? deviceState.onlineStatuses[did] === 'online' : false;
		if (did && authState.isAuthenticated) {
			const hasCached = untrack(() => !!modelList);
			const alreadyFetching = untrack(() => isFetchingModels);
			if (alreadyFetching) return;
			if (hasCached) {
				// Revalidate immediately — don't wait for online status
				fetchModelsForDevice(true);
			} else if (online) {
				// Cold load — only when device is confirmed online
				fetchModelsForDevice(false);
			}
		}
	});

	// Poll for updates while downloading a model
	$effect(() => {
		if (downloadingModelIndex !== undefined && deviceState.selectedDeviceId) {
			const interval = setInterval(() => {
				fetchModelsForDevice(true);
			}, 5000);

			return () => clearInterval(interval);
		}
	});

	async function fetchModelsForDevice(silent = false) {
		isFetchingModels = true;
		if (!silent) {
			// Don't clear modelList here to avoid UI flickering ("keep-alive" pattern)
			currentModelShortName = undefined;
			selectedModelShortName = undefined;
			downloadingModelIndex = undefined;
			loadingModels = true;
		}
		// isOffroad is derived, no need to reset local state

		const client = logtoClient;
		if (!client) return;
		if (!deviceState.selectedDeviceId) return;
		try {
			const token = await client.getIdToken();
			if (!token) return;

			const models = await fetchSettingsAsync(
				deviceState.selectedDeviceId,
				[
					'ModelManager_ModelsCache',
					'ModelManager_ActiveBundle',
					'ModelManager_DownloadIndex',
					'ModelManager_Favs',
					...MODEL_SETTINGS
				],
				token
			);

			// Handle fetch errors
			if (models.error) {
				const err = models.error;
				const errorMessages: Record<string, string> = {
					timeout: 'Device took too long to respond. Please try again.',
					expired: 'Request expired. Please try again.',
					not_found: 'Device not reachable. Please check connection.',
					error: 'Failed to fetch models. Please try again.'
				};
				if (!silent) {
					const message: string =
						(err && err in errorMessages ? errorMessages[err] : errorMessages.error) ??
						'Failed to fetch models. Please try again.';
					toastState.show(message, 'error');
				}
				return;
			}

			if (models.items) {
				const modelsCacheParam = models.items.find((i) => i.key === 'ModelManager_ModelsCache');
				const activeBundleParam = models.items.find((i) => i.key === 'ModelManager_ActiveBundle');
				const downloadIndexParam = models.items.find((i) => i.key === 'ModelManager_DownloadIndex');
				const favsParam = models.items.find((i) => i.key === 'ModelManager_Favs');

				// Populate deviceValues for the other settings too to ensure they are available
				const deviceId = deviceState.selectedDeviceId!;
				if (!deviceState.deviceValues[deviceId]) {
					deviceState.deviceValues[deviceId] = {};
				}
				const values = deviceState.deviceValues[deviceId];
				models.items.forEach((item) => {
					if (item.key && values) {
						values[item.key] = decodeParamValue(item);
					}
				});

				if (favsParam) {
					const decodedFavs = decodeParamValue(favsParam);
					if (typeof decodedFavs === 'string') {
						favorites = new Set(decodedFavs.split(';').filter((f) => f.length > 0));
					}
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

				if (downloadIndexParam) {
					const val = decodeParamValue(downloadIndexParam);
					const idx = parseInt(String(val), 10);
					if (!isNaN(idx) && idx > 0) {
						downloadingModelIndex = idx;
					} else {
						downloadingModelIndex = undefined;
					}
				} else {
					downloadingModelIndex = undefined;
				}
			}
			// Persist to cache for SWR on next visit
			if (modelList && deviceState.selectedDeviceId) {
				saveModelsCache(deviceState.selectedDeviceId, modelList, currentModelShortName, favorites);
			}
		} catch (e) {
			console.error('Error fetching models:', e);
		} finally {
			loadingModels = false;
			isFetchingModels = false;
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


	async function pushModelToDevice(bundle: ModelBundle) {
		if (!logtoClient) return;
		if (!deviceState.selectedDeviceId) return;

		try {
			sendingModel = true;

			// Pre-push check: Verify device is offroad via fresh getMessage
			const token = await logtoClient.getIdToken();
			if (!token) throw new Error('Not authenticated');

			const deviceMessage = await fetchDeviceMessage(deviceState.selectedDeviceId, token);
			if (deviceMessage === null) {
				throw new Error('Device not reachable. Please check connection.');
			}

			const currentIsOffroad = !((deviceMessage.started as boolean) ?? false);
			const forceOffroad =
				deviceState.offroadStatuses[deviceState.selectedDeviceId]?.forceOffroad ?? false;

			// Update global state to reflect real-time status
			if (deviceState.selectedDeviceId) {
				deviceState.offroadStatuses[deviceState.selectedDeviceId] = {
					isOffroad: currentIsOffroad,
					forceOffroad
				};
			}

			// Allow push if device is offroad OR forceOffroad is enabled
			if (!currentIsOffroad && !forceOffroad) {
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
			if (bundle.short_name === 'default') {
				currentModelShortName = undefined;
				downloadingModelIndex = undefined;
			} else if (bundle.index !== undefined) {
				downloadingModelIndex = bundle.index;
			}

			selectedModelShortName = undefined;
			sendingModel = false;

			// Refresh status silently
			fetchModelsForDevice(true);
		} catch (e: unknown) {
			const message = (e as Error)?.message || 'Failed to send model to device.';
			console.error('Error sending model to device:', e);
			toastState.show(message, 'error');
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
		// Optimistic UI: immediately show default model, close modal
		const previousModel = currentModelShortName;
		currentModelShortName = undefined;
		resetModalOpen = false;

		try {
			await pushModelToDevice(DEFAULT_MODEL);
		} catch {
			// Rollback on failure
			currentModelShortName = previousModel;
		}
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

	function toggleFavorite(bundle: ModelBundle, event?: Event) {
		if (event) {
			event.stopPropagation();
		}
		const did = deviceState.selectedDeviceId;
		if (!did) return;

		// Optimistic: update UI immediately
		const newFavorites = new Set(favorites);
		if (newFavorites.has(bundle.ref)) {
			newFavorites.delete(bundle.ref);
		} else {
			newFavorites.add(bundle.ref);
		}
		favorites = newFavorites;
		toggledFavRefs = new Set([...toggledFavRefs, bundle.ref]);

		const favString = Array.from(newFavorites).sort().join(';');

		// Update deviceValues so it's tracked, then batch push.
		// Normalize previousValue to sorted form so net-change detection works
		// (device may return favorites in a different order than Set iteration).
		if (!deviceState.deviceValues[did]) deviceState.deviceValues[did] = {};
		const rawPrev = (deviceState.deviceValues[did]['ModelManager_Favs'] as string) ?? '';
		const previousValue = rawPrev.split(';').filter(Boolean).sort().join(';');
		deviceState.deviceValues[did]['ModelManager_Favs'] = favString;
		batchPush.enqueue(did, 'ModelManager_Favs', favString, previousValue, 'String');
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

<SettingsPageShell
	title="Models"
	description="Manage and switch driving models & related settings for your device."
	syncStatus={modelList ? sync.status : undefined}
	loading={!!(loadingModels || isCheckingStatus) && !modelList}
	onRefresh={() => fetchModelsForDevice(true)}
>

	{#if authState.loading}
		<DashboardSkeleton />
	{:else if !deviceState.selectedDeviceId}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<div class="mb-4 rounded-full bg-[var(--sl-bg-elevated)]/50 p-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-12 w-12 text-[var(--sl-text-2)]"
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
			<h3 class="text-xl font-semibold text-[var(--sl-text-1)]">No Device Selected</h3>
			<p class="mt-2 text-[var(--sl-text-2)]">Select a device to view available models.</p>
		</div>
	{:else if (loadingModels || isCheckingStatus) && !modelList}
		<div class="animate-pulse space-y-6">
			{#if isCheckingStatus}
				<div class="flex items-center gap-2 text-[var(--sl-text-2)]">
					<span class="loading loading-sm loading-spinner"></span>
					<span>Checking device status...</span>
				</div>
			{/if}
			<div class="h-12 w-full rounded bg-[var(--sl-bg-elevated)]"></div>
			<div class="h-48 w-full rounded bg-[var(--sl-bg-elevated)]"></div>
		</div>
	{:else}
		<!-- Inline offline/error banner — identical to settings/+layout.svelte -->
		{#if isOffline || isError}
			<div class="flex items-center gap-2.5 rounded-lg border px-4 py-2.5
				{isError ? 'border-orange-500/20 bg-orange-50 dark:bg-orange-500/5' : 'border-amber-500/20 bg-amber-50 dark:bg-yellow-500/5'}">
				{#if isError}
					<AlertTriangle size={16} class="shrink-0 text-orange-600 dark:text-orange-400" />
					<div class="flex-1">
						<p class="text-sm text-orange-800 dark:text-orange-200/80">
							<span class="font-medium">Connection error</span> — {deviceState.lastErrorMessages[deviceState.selectedDeviceId || ''] || 'Unable to reach device.'} Showing cached models.
						</p>
						{#if lastRetryAt}
							<p class="mt-0.5 text-[0.6875rem] text-orange-600/60 dark:text-orange-300/50">Checked {formatRelativeTime(lastRetryAt)}</p>
						{/if}
					</div>
				{:else}
					<WifiOff size={16} class="shrink-0 text-amber-600 dark:text-yellow-500" />
					<div class="flex-1">
						<p class="text-sm text-amber-800 dark:text-yellow-200/80">
							{#if retryFailed}
								<span class="font-medium">Still offline</span> — Device not reachable. Showing cached models.
							{:else}
								<span class="font-medium">Offline</span> — Showing cached models. Changes disabled until device is online.
							{/if}
						</p>
						{#if lastRetryAt}
							<p class="mt-0.5 text-[0.6875rem] text-amber-600/60 dark:text-yellow-300/50">Checked {formatRelativeTime(lastRetryAt)}</p>
						{/if}
					</div>
				{/if}
				<button
					class="btn btn-ghost btn-xs shrink-0 {isError ? 'text-orange-700 dark:text-orange-400' : 'text-yellow-700 dark:text-yellow-400'}"
					disabled={retrying}
					onclick={handleRetry}
				>
					{#if retrying}
						<span class="loading loading-spinner loading-xs"></span>
						Checking...
					{:else}
						<RefreshCw size={14} />
						Retry
					{/if}
				</button>
			</div>
		{/if}
		<div>
			{#if currentModel}
				<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] {sendingModel ? 'opacity-60' : ''}  transition-opacity duration-200">
				<div class="flex items-center justify-between px-4 py-4">
					<div class="flex items-center gap-3 min-w-0">
						<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sl-bg-elevated)]">
							<Smartphone size={14} class="text-[var(--sl-text-2)]" />
						</div>
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium text-[var(--sl-text-1)] truncate">{currentModel.display_name}</span>
								<code class="shrink-0 rounded bg-[var(--sl-bg-elevated)] px-1.5 py-0.5 font-mono text-[0.6875rem] text-[var(--sl-text-3)]">{currentModel.short_name}</code>
							</div>
						</div>
					</div>
					{#if sendingModel}
						<div class="flex shrink-0 items-center gap-2 text-xs text-[var(--sl-text-2)]">
							<span class="loading loading-xs loading-spinner"></span>
							Sending...
						</div>
					{:else if downloadingModelIndex !== undefined && currentModel.index === downloadingModelIndex}
						<div class="flex shrink-0 items-center gap-2 text-xs text-[var(--sl-text-2)]">
							<span class="loading loading-xs loading-spinner"></span>
							Downloading
						</div>
					{:else}
						<div class="flex shrink-0 items-center gap-1.5 text-xs text-[var(--sl-green)]">
							<span class="h-1.5 w-1.5 rounded-full bg-[var(--sl-green)]"></span>
							Active
						</div>
					{/if}
				</div>
				<!-- Metadata: label-value rows (consistent with Dashboard card pattern) -->
				{#if currentModel.environment !== 'N/A' || currentModel.generation || currentModel.runner}
					<div class="border-t border-[var(--sl-border-muted)] px-4 py-3">
						<div class="max-w-[280px] space-y-1.5">
							{#if currentModel.environment && currentModel.environment !== 'N/A'}
								<div class="flex items-center gap-3">
									<span class="w-20 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Environment</span>
									<span class="text-[0.75rem] text-[var(--sl-text-2)]">{currentModel.environment}</span>
								</div>
							{/if}
							{#if currentModel.runner && currentModel.runner !== 'N/A'}
								<div class="flex items-center gap-3">
									<span class="w-20 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Runner</span>
									<span class="text-[0.75rem] text-[var(--sl-text-2)]">{currentModel.runner}</span>
								</div>
							{/if}
							{#if currentModel.generation}
								<div class="flex items-center gap-3">
									<span class="w-20 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Generation</span>
									<span class="text-[0.75rem] text-[var(--sl-text-2)]">{currentModel.generation}</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}
				<div class="flex items-center gap-3 border-t border-[var(--sl-border-muted)] px-4 py-2.5">
					{#if currentModelShortName !== undefined}
						<button
							class="text-[0.75rem] text-[var(--sl-text-2)] transition-colors hover:text-[var(--sl-text-1)] disabled:opacity-40"
							onclick={() => (resetModalOpen = true)}
							disabled={sendingModel}
							title={!isOffroad ? 'Device must be offroad' : undefined}
						>
							Reset to Default
						</button>
						<span class="text-[var(--sl-border)]">|</span>
					{/if}
					<button
						class="text-[0.75rem] text-[var(--sl-text-2)] transition-colors hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
						onclick={() => (clearCacheModalOpen = true)}
						disabled={clearingCache}
						title={!isOffroad ? 'Device must be offroad' : undefined}
					>
						Clear Cache
					</button>
				</div>
			</div>

			{/if}

			<div class="mt-12 px-4">
				<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Available Models</p>
			</div>

			<div class="mt-3 relative overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
				<div class="border-b border-[var(--sl-border-muted)] bg-[var(--sl-bg-surface)] px-4 py-2.5">
					<div class="relative">
						<input
							type="text"
							placeholder="Search models..."
							class="w-full rounded-lg border-none bg-[var(--sl-bg-input)] py-2 pr-9 pl-9 text-[0.8125rem] text-[var(--sl-text-1)] placeholder:text-[var(--sl-text-3)] focus:outline-none focus:ring-1 focus:ring-[var(--sl-border)]"
							bind:value={searchQuery}
						/>
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
							<Search size={14} class="text-[var(--sl-text-3)]" />
						</div>
						{#if searchQuery}
							<button
								type="button"
								class="absolute inset-y-0 right-0 flex items-center pr-2.5 text-[var(--sl-text-3)] transition-colors hover:text-[var(--sl-text-2)]"
								onclick={() => { searchQuery = ''; }}
								aria-label="Clear search"
							>
								<X size={14} />
							</button>
						{/if}
					</div>
				</div>

				<div class="relative">
					{#if loadingModels && !modelList}
						<div class="p-6 text-center text-[var(--sl-text-3)]">
							<span class="loading loading-spinner text-primary"></span>
						</div>
					{:else if groupedModels.length === 0 && searchQuery}
						<div class="p-6 text-center text-[var(--sl-text-3)]">
							No models available matching "{searchQuery}"
						</div>
					{:else}
						<div>
							{#each groupedModels as group (group.name)}
								<div class="border-b border-[var(--sl-border-muted)] last:border-0">
									<button
										class="flex w-full items-center gap-3 bg-[var(--sl-bg-surface)]/80 px-4 py-3.5 text-left transition-colors hover:bg-[var(--sl-bg-subtle)] focus:outline-none"
										onclick={() => toggleFolder(group.name)}
									>
										<ChevronRight
											size={16}
											class="text-[var(--sl-text-3)] transition-transform duration-200 {openFolders[
												group.name
											]
												? 'rotate-90'
												: ''}"
										/>
										{#if group.name === 'Favorites'}
											<Star size={16} class="fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
										{:else}
											<Folder size={16} class="text-primary" />
										{/if}
										<div class="flex items-center gap-2">
											<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">{group.name}</span>
											{#if getFolderExplanation(group.name)}
												<div
													class="tooltip tooltip-right flex items-center"
													data-tip={getFolderExplanation(group.name)}
												>
													<CircleHelp
														size={14}
														class="text-[var(--sl-text-3)] transition-colors hover:text-[var(--sl-text-2)]"
													/>
												</div>
											{/if}
										</div>
										<span class="ml-auto text-[0.75rem] text-[var(--sl-text-3)]">
											{group.models.length}
										</span>
									</button>

									{#if openFolders[group.name]}
										<div transition:slide={{ duration: 200 }} class="bg-[var(--sl-bg-subtle)]">
											{#each group.models as model (model.short_name)}
												{@const favKeyState = toggledFavRefs.has(model.ref) && deviceState.selectedDeviceId ? batchPush.getKeyState(deviceState.selectedDeviceId, 'ModelManager_Favs') : undefined}
												{@const isFavSyncing = favKeyState === 'syncing'}
												<div role="button" tabindex="0"
													class="group flex w-full items-center justify-between px-4 py-3.5 pl-11 text-left transition-all hover:bg-[var(--sl-bg-subtle)]"
													class:opacity-50={isFavSyncing}
													class:pointer-events-none={isFavSyncing}
													onclick={() => (selectedModelShortName = selectedModelShortName === model.short_name ? undefined : model.short_name)}
												>
													<div class="flex items-center gap-2">
														<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
															{model.display_name}
														</span>
														{#if favKeyState === 'pending'}
															<span class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-700 dark:text-amber-400">Pending</span>
														{:else if isFavSyncing}
															<span class="loading loading-spinner loading-xs text-primary"></span>
														{:else if favKeyState === 'confirmed'}
															<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
																stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
																class="text-emerald-600 dark:text-emerald-400"><path d="M20 6 9 17l-5-5" /></svg>
														{/if}
													</div>
													<div class="flex items-center gap-2">
														<button
															class="p-1.5 text-[var(--sl-text-3)] transition-all duration-150 hover:text-amber-600 dark:hover:text-amber-400 active:scale-90"
															class:pointer-events-none={isFavSyncing}
															onclick={(e) => { e.stopPropagation(); toggleFavorite(model, e); }}
															title={favorites.has(model.ref) ? 'Remove from Favorites' : 'Add to Favorites'}
														>
															<Star size={14} class="transition-all duration-150 {favorites.has(model.ref) ? 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400 scale-110' : 'scale-100'}" />
														</button>
														<ChevronRight size={14} class="text-[var(--sl-text-3)] transition-transform duration-150 {selectedModelShortName === model.short_name ? 'rotate-90' : ''}" />
													</div>
												</div>
												{#if selectedModelShortName === model.short_name}
													<div transition:slide={{ duration: 150 }} class="border-t border-[var(--sl-border-muted)] bg-[var(--sl-bg-surface)]/60 px-4 py-4 pl-11">
														<div class="flex items-start justify-between gap-4">
															<div class="min-w-0 flex-1">
																<code class="rounded bg-[var(--sl-bg-elevated)] px-1.5 py-0.5 font-mono text-[0.6875rem] text-[var(--sl-text-3)]">{model.short_name}</code>
																<div class="mt-3 flex max-w-xs flex-col gap-1.5 text-xs">
																	<div class="flex items-baseline justify-between">
																		<span class="text-[var(--sl-text-3)]">Environment</span>
																		<span class="text-[var(--sl-text-2)]">{model.environment}</span>
																	</div>
																	<div class="flex items-baseline justify-between">
																		<span class="text-[var(--sl-text-3)]">Runner</span>
																		<span class="text-[var(--sl-text-2)]">{model.runner ?? 'Unknown'}</span>
																	</div>
																	<div class="flex items-baseline justify-between">
																		<span class="text-[var(--sl-text-3)]">Generation</span>
																		<span class="text-[var(--sl-text-2)]">{model.generation ?? 'Unknown'}</span>
																	</div>
																	<div class="flex items-baseline justify-between">
																		<span class="text-[var(--sl-text-3)]">Build</span>
																		<span class="text-[var(--sl-text-2)]">{model.build_time ? new Date(model.build_time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown'}</span>
																	</div>
																</div>
															</div>
														</div>
														{#if !isOffroad}
															<p class="mt-3 text-xs text-amber-700 dark:text-amber-400">Device is onroad. Models cannot be changed while driving.</p>
														{/if}
														<div class="mt-4 flex items-center gap-3">
															{#if currentModel?.short_name === model.short_name}
																<div class="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
																	<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
																		stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
																	Active
																</div>
															{:else}
																<button
																	class="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/80 disabled:opacity-40"
																	onclick={() => sendModelToDevice()}
																	disabled={sendingModel || !isOffroad}
																>
																	{#if sendingModel}
																		<span class="loading loading-xs loading-spinner mr-1"></span>
																		Activating...
																	{:else}
																		Activate
																	{/if}
																</button>
															{/if}
														</div>
													</div>
												{/if}
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			{#if deviceState.selectedDeviceId}
				{@const modelsPanel = schemaState.schemas[deviceState.selectedDeviceId]?.panels?.find(p => p.id === 'models')}
				{#if modelsPanel}
					<div class="mt-12">
					<SchemaPanel
						deviceId={deviceState.selectedDeviceId}
						panel={modelsPanel}
						loadingValues={loadingModels}
					/>
					</div>
				{:else if currentModel}
					{@const modelSettingItems = [
						cameraOffsetParam && currentModel !== DEFAULT_MODEL ? cameraOffsetParam : null,
						lagdToggleParam,
						lagdToggleDelayParam && lagdToggleValue === false ? lagdToggleDelayParam : null,
						laneTurnDesireParam,
						laneTurnValueParam && laneTurnDesireParamValue === true ? laneTurnValueParam : null,
						nnlcParam && isLegacyActive ? nnlcParam : null
					].filter((p): p is NonNullable<typeof p> => p !== null)}
					{#if modelSettingItems.length > 0}
						<div class="mt-12 px-4">
							<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Model Settings</p>
						</div>
						<div class="mt-3 overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
							{#each modelSettingItems as param, i (param.key)}
								<SchemaItemRenderer
									deviceId={deviceState.selectedDeviceId}
									item={settingToSchemaItem(param)}
									loadingValues={loadingModels}
									isLast={i === modelSettingItems.length - 1}
								/>
							{/each}
						</div>
					{/if}
				{/if}
			{/if}
		</div>

		<!-- Modal removed — model selection is now inline within the folder list -->
	{/if}
</SettingsPageShell>

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

<SettingsActionBar
	onPush={() => (pushModalOpen = true)}
	onReset={() =>
		deviceState.selectedDeviceId && deviceState.clearChanges(deviceState.selectedDeviceId)}
/>

<PushSettingsModal
	bind:open={pushModalOpen}
	onPushSuccess={() => {
		fetchModelsForDevice(true);
		toastState.show('Settings pushed successfully!', 'success');
	}}
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
