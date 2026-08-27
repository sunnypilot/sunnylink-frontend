<script lang="ts">
	import { untrack } from 'svelte';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { Athenav0Client } from '$lib/api/client';
	import { checkDeviceStatus, fetchSettingsAsync, fetchDeviceMessage } from '$lib/api/device';
	import { isModelManifest, type ModelBundle } from '$lib/types/models';
	import {
		SETTINGS_DEFINITIONS,
		MODEL_SETTINGS,
		type RenderableSetting
	} from '$lib/types/settings';
	import { deviceState } from '$lib/stores/device.svelte';
	import DashboardSkeleton from '../DashboardSkeleton.svelte';
	import ForceOffroadModal from '$lib/components/ForceOffroadModal.svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import SchemaItemRenderer from '$lib/components/schema/SchemaItemRenderer.svelte';
	import SchemaPanel from '$lib/components/schema/SchemaPanel.svelte';
	import type { Panel } from '$lib/types/schema';
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
		Cpu,
		Gpu,
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
	import { toast } from 'svelte-sonner';

	let DEFAULT_SMALL_MODEL = $derived.by<ModelBundle>(() => {
		const did = deviceState.selectedDeviceId;
		const schema = did ? schemaState.schemas[did] : undefined;
		return {
			short_name: 'default',
			display_name: schema?.default_model || 'Default Model',
			is_20hz: false,
			ref: 'default',
			environment: 'N/A',
			models: []
		};
	});

	let DEFAULT_BIG_MODEL = $derived.by<ModelBundle>(() => {
		const did = deviceState.selectedDeviceId;
		const schema = did ? schemaState.schemas[did] : undefined;
		return {
			short_name: 'default',
			display_name: schema?.default_big_model || 'Default Big Model',
			is_20hz: false,
			ref: 'default',
			environment: 'N/A',
			models: []
		};
	});

	const MODELS_CACHE_PREFIX = 'sunnylink_models_';
	const MODELS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

	interface ModelsCacheEntry {
		qcomModelList?: ModelBundle[];
		usbgpuModelList?: ModelBundle[];
		currentSmallModelShortName?: string;
		currentBigModelShortName?: string;
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
		} catch {
			return null;
		}
	}

	function saveModelsCache(
		deviceId: string,
		qcomList: ModelBundle[] | undefined,
		usbgpuList: ModelBundle[] | undefined,
		smallShortName: string | undefined,
		bigShortName: string | undefined,
		favs: Set<string>
	): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const entry: ModelsCacheEntry = {
				qcomModelList: qcomList,
				usbgpuModelList: usbgpuList,
				currentSmallModelShortName: smallShortName,
				currentBigModelShortName: bigShortName,
				favorites: Array.from(favs),
				timestamp: Date.now()
			};
			localStorage.setItem(`${MODELS_CACHE_PREFIX}${deviceId}`, JSON.stringify(entry));
		} catch {}
	}

	let { data } = $props();

	// Load schema when device is selected (same pattern as settings pages)
	let deviceId = $derived(deviceState.selectedDeviceId);
	$effect(() => {
		if (
			deviceId &&
			logtoClient &&
			!schemaState.schemas[deviceId] &&
			!schemaState.loading[deviceId] &&
			!schemaState.schemaUnavailable[deviceId]
		) {
			loadSchema();
		}
	});

	async function loadSchema() {
		if (!deviceId || !logtoClient) return;
		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;
			const gitCommit = deviceState.deviceValues[deviceId]?.['GitCommit'] as string | undefined;
			await schemaState.loadSchema(deviceId, token, gitCommit);
		} catch (e) {
			console.error('Failed to load schema:', e);
		}
	}

	let qcomModelList = $state<ModelBundle[] | undefined>();
	let usbgpuModelList = $state<ModelBundle[] | undefined>();
	let currentSmallModelShortName = $state<string | undefined>(undefined);
	let currentBigModelShortName = $state<string | undefined>(undefined);
	let selectedModelRef = $state<string | undefined>(undefined);
	let activeModelTab = $state<'qcom' | 'usbgpu'>('qcom');
	let searchQuery = $state('');
	let lastSearchQuery = '';

	let loadingModels = $state(false);
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
			? ((deviceState.deviceValues[deviceState.selectedDeviceId]?.[
					'ModelManager_Favs'
				] as string) ?? '')
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
		if (!did || qcomModelList || usbgpuModelList) return;
		const cached = loadModelsCache(did);
		if (cached) {
			qcomModelList = cached.qcomModelList;
			usbgpuModelList = cached.usbgpuModelList;
			currentSmallModelShortName = cached.currentSmallModelShortName;
			currentBigModelShortName = cached.currentBigModelShortName;
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
	let downloadingRef = $state<string | undefined>(undefined);
	let downloadRefConfirmed = $state(false);
	let sendingModelType = $state<'qcom' | 'usbgpu' | undefined>(undefined);
	let resetModalType = $state<'qcom' | 'usbgpu'>('qcom');
	let sendingModel = $derived(sendingModelType !== undefined);

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

	function currentModelForType(
		list: ModelBundle[] | undefined,
		activeShortName: string | undefined,
		defaultModel: ModelBundle
	): ModelBundle | undefined {
		if (downloadingRef !== undefined && list) {
			const downloadingModel = list.find((m) => m.ref === downloadingRef);
			if (downloadingModel) return downloadingModel;
		}
		if (!list) return undefined;
		if (activeShortName !== undefined) {
			return list.find((m) => m.short_name === activeShortName) ?? defaultModel;
		}
		// Don't flash the default model while still loading/resolving
		if (loadingModels) return undefined;
		return defaultModel;
	}

	let currentSmallModel = $derived(
		currentModelForType(qcomModelList, currentSmallModelShortName, DEFAULT_SMALL_MODEL)
	);
	let currentBigModel = $derived(
		currentModelForType(usbgpuModelList, currentBigModelShortName, DEFAULT_BIG_MODEL)
	);
	let currentTabModel = $derived(activeModelTab === 'usbgpu' ? currentBigModel : currentSmallModel);

	interface ActiveModelCard {
		type: 'qcom' | 'usbgpu';
		label: string;
		model: ModelBundle;
		activeShortName: string | undefined;
	}

	let activeModelCards = $derived(
		(
			[
				{
					type: 'qcom' as const,
					label: 'Small Model',
					model: currentSmallModel,
					activeShortName: currentSmallModelShortName
				},
				{
					type: 'usbgpu' as const,
					label: 'Big Model',
					model: currentBigModel,
					activeShortName: currentBigModelShortName
				}
			] as ActiveModelCard[]
		).filter((c): c is ActiveModelCard => c.model !== undefined)
	);

	let isLegacyActive = $derived(
		currentSmallModel?.overrides?.folder?.toLowerCase().includes('legacy') ?? false
	);
	let selectedModel = $derived(
		[...(qcomModelList ?? []), ...(usbgpuModelList ?? [])].find((m) => m.ref === selectedModelRef)
	);

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
	let isRevalidating = $derived(
		isFetchingModels && (qcomModelList !== undefined || usbgpuModelList !== undefined)
	);

	let batchActive = $derived(
		deviceState.selectedDeviceId ? batchPush.isActive(deviceState.selectedDeviceId) : false
	);
	let isStale = $derived(!!(deviceId && deviceState.valuesStale[deviceId]));
	const sync = createSyncStatus(
		() => isCheckingStatus || isRevalidating || batchActive || isStale,
		() => !isOffline && !isError && !isCheckingStatus && !batchActive && !isStale
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

	let activeModelList = $derived(activeModelTab === 'usbgpu' ? usbgpuModelList : qcomModelList);

	// Group models by folder
	let groupedModels = $derived.by(() => {
		if (!activeModelList) return [];

		const groups: Record<string, ModelBundle[]> = {};
		const favModels: ModelBundle[] = [];

		for (const model of activeModelList) {
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

	function switchModelTab(tab: 'qcom' | 'usbgpu') {
		if (tab === activeModelTab) return;
		activeModelTab = tab;
		// Selection is per-catalog; clear it when switching tabs
		selectedModelRef = undefined;
	}

	// Auto-expand folder for the matches if search is active
	$effect(() => {
		if (searchQuery && activeModelList) {
			const q = searchQuery.toLowerCase();
			const nextOpen: Record<string, boolean> = {};
			activeModelList.forEach((m) => {
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
			const hasCached = untrack(() => !!(qcomModelList || usbgpuModelList));
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

	// Re-fetch models when valuesStale is set (header offroad toggle, manual
	// refresh button, version-poll drift). Mirrors the osm/+page guard pattern.
	$effect(() => {
		const did = deviceState.selectedDeviceId;
		if (did && deviceState.valuesStale[did] && !untrack(() => isFetchingModels)) {
			fetchModelsForDevice(true).finally(() => {
				if (deviceState.valuesStale[did]) deviceState.valuesStale[did] = false;
			});
		}
	});

	// Poll for updates while downloading a model; re-fetch once when download completes
	let wasDownloading = $state(false);
	$effect(() => {
		if (downloadingRef !== undefined && deviceState.selectedDeviceId) {
			wasDownloading = true;
			const interval = setInterval(() => {
				fetchModelsForDevice(true);
			}, 5000);

			return () => clearInterval(interval);
		}
		if (wasDownloading) {
			wasDownloading = false;
			fetchModelsForDevice(true);
		}
	});

	async function fetchModelJsonFromUrl(url: string): Promise<ModelBundle[] | null> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort('Model JSON fetch timeout'), 15_000);

		try {
			const response = await fetch(url, { signal: controller.signal });
			if (!response.ok) {
				console.error(`Failed to fetch model JSON: ${response.status} ${response.statusText}`);
				return null;
			}

			const json = await response.json();
			if (isModelManifest(json)) {
				return json.bundles;
			}

			console.warn('Model JSON from URL is invalid');
			return null;
		} catch (e) {
			if ((e as { name?: string })?.name === 'AbortError') {
				console.error('Model JSON fetch timed out');
			} else {
				console.error('Error fetching model JSON from URL:', e);
			}
			return null;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	function decodeActiveJsonUrls(value: unknown): { qcom?: string; usbgpu?: string } | null {
		let parsed: unknown = value;
		if (typeof parsed === 'string') {
			try {
				parsed = JSON.parse(parsed);
			} catch {
				return null;
			}
		}
		if (typeof parsed !== 'object' || parsed === null) return null;
		const obj = parsed as Record<string, unknown>;
		if (typeof obj.qcom !== 'string' && typeof obj.usbgpu !== 'string') return null;
		return {
			...(typeof obj.qcom === 'string' ? { qcom: obj.qcom } : {}),
			...(typeof obj.usbgpu === 'string' ? { usbgpu: obj.usbgpu } : {})
		};
	}

	function shortNameFromActiveBundle(decodedValue: unknown): string | undefined {
		let value = decodedValue;

		if (typeof value === 'string') {
			try {
				value = JSON.parse(value);
			} catch (e) {
				console.warn('Failed to parse Active Bundle string as JSON:', e);
			}
		}

		if (typeof value === 'object' && value !== null) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const bundle = value as any;
			if ('short_name' in bundle && typeof bundle.short_name === 'string') {
				return bundle.short_name;
			}
			if ('internalName' in bundle && typeof bundle.internalName === 'string') {
				return bundle.internalName;
			}
		}

		return undefined;
	}

	async function fetchModelsForDevice(silent = false) {
		if (isFetchingModels) return;
		const client = logtoClient;
		if (!client) return;
		const did = deviceState.selectedDeviceId;
		if (!did) return;
		isFetchingModels = true;
		if (!silent) {
			// Don't clear the model lists here to avoid UI flickering ("keep-alive" pattern)
			currentSmallModelShortName = undefined;
			currentBigModelShortName = undefined;
			selectedModelRef = undefined;
			downloadingRef = undefined;
			downloadRefConfirmed = false;
			loadingModels = true;
		}
		try {
			const token = await client.getIdToken();
			if (!token) return;

			const models = await fetchSettingsAsync(
				did,
				[
					'ModelManager_ActiveJson',
					'ModelManager_ActiveBundle',
					'ModelManager_ActiveBundleUSBGPU',
					'ModelManager_PrevBundle',
					'ModelManager_PrevBundle_USBGPU',
					'ModelManager_DownloadRef',
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
					toast.error(message);
				}
				return;
			}

			if (models.items) {
				const activeJsonParam = models.items.find((i) => i.key === 'ModelManager_ActiveJson');
				const activeBundleParam = models.items.find((i) => i.key === 'ModelManager_ActiveBundle');
				const activeBundleUsbGpuParam = models.items.find(
					(i) => i.key === 'ModelManager_ActiveBundleUSBGPU'
				);
				const downloadRefParam = models.items.find((i) => i.key === 'ModelManager_DownloadRef');
				const favsParam = models.items.find((i) => i.key === 'ModelManager_Favs');

				// Populate deviceValues for the other settings too to ensure they are available
				if (did !== deviceState.selectedDeviceId) return;
				if (!deviceState.deviceValues[did]) {
					deviceState.deviceValues[did] = {};
				}
				const values = deviceState.deviceValues[did];
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

				if (activeJsonParam) {
					const urls = decodeActiveJsonUrls(decodeParamValue(activeJsonParam));

					if (urls) {
						// Fetch both catalogs in parallel directly from their URLs
						const [qcomBundles, usbgpuBundles] = await Promise.all([
							urls.qcom ? fetchModelJsonFromUrl(urls.qcom) : Promise.resolve(null),
							urls.usbgpu ? fetchModelJsonFromUrl(urls.usbgpu) : Promise.resolve(null)
						]);
						if (did !== deviceState.selectedDeviceId) return;
						if (qcomBundles) {
							qcomModelList = qcomBundles;
						}
						if (usbgpuBundles) {
							usbgpuModelList = usbgpuBundles;
						}
					} else {
						console.warn('ModelManager_ActiveJson did not contain a valid {qcom, usbgpu} URL map');
					}
				} else {
					console.warn('ModelManager_ActiveJson not found — no model catalogs available');
				}

				currentSmallModelShortName = activeBundleParam
					? shortNameFromActiveBundle(decodeParamValue(activeBundleParam))
					: undefined;
				currentBigModelShortName = activeBundleUsbGpuParam
					? shortNameFromActiveBundle(decodeParamValue(activeBundleUsbGpuParam))
					: undefined;

				const deviceRef = downloadRefParam
					? (() => {
							const val = decodeParamValue(downloadRefParam);
							return typeof val === 'string' && val.trim() ? val.trim() : undefined;
						})()
					: undefined;
				if (deviceRef) {
					downloadingRef = deviceRef;
					downloadRefConfirmed = true;
				} else if (downloadingRef !== undefined && downloadRefConfirmed) {
					downloadingRef = undefined;
					downloadRefConfirmed = false;
				}

				// The download is complete once the matching catalog's active bundle
				// points at the tracked ref — whether or not the device still reports
				// it. This also ends the polling loop.
				if (downloadingRef !== undefined) {
					const pending = downloadingRef;
					const pendingSmall = qcomModelList?.find((m) => m.ref === pending);
					const pendingBig = usbgpuModelList?.find((m) => m.ref === pending);
					const smallDone =
						pendingSmall !== undefined && pendingSmall.short_name === currentSmallModelShortName;
					const bigDone =
						pendingBig !== undefined && pendingBig.short_name === currentBigModelShortName;
					if (smallDone || bigDone) {
						downloadingRef = undefined;
						downloadRefConfirmed = false;
					}
				}
			}
			// Persist to cache for SWR on next visit
			if ((qcomModelList || usbgpuModelList) && did === deviceState.selectedDeviceId) {
				saveModelsCache(
					did,
					qcomModelList,
					usbgpuModelList,
					currentSmallModelShortName,
					currentBigModelShortName,
					favorites
				);
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

	async function refreshModels() {
		if (!logtoClient || !deviceState.selectedDeviceId) return;
		const refreshDid = deviceState.selectedDeviceId;

		try {
			loadingModels = true;
			const token = await logtoClient.getIdToken();
			if (refreshDid !== deviceState.selectedDeviceId) return;

			// 1. Clear the last update times to force a refresh of both catalogs
			await Athenav0Client.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: refreshDid
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
					},
					{
						key: 'ModelManager_LastSyncTime_USBGPU',
						value: encodeParamValue({
							key: 'ModelManager_LastSyncTime_USBGPU',
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

	async function pushModelToDevice(bundle: ModelBundle, type: 'qcom' | 'usbgpu') {
		if (!logtoClient) return;
		if (!deviceState.selectedDeviceId) return;
		const currentShortName =
			type === 'usbgpu' ? currentBigModelShortName : currentSmallModelShortName;
		if (bundle.short_name === currentShortName) {
			toast.info('Model already active');
			selectedModelRef = undefined;
			return;
		}

		try {
			sendingModelType = type;

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

			const activeParamKey =
				type === 'usbgpu' ? 'ModelManager_ActiveBundleUSBGPU' : 'ModelManager_ActiveBundle';
			const params = [];
			if (bundle.short_name === 'default') {
				params.push({
					key: activeParamKey,
					value: encodeParamValue({
						key: activeParamKey,
						value: '{}',
						type: 'String'
					}),
					is_compressed: false
				});
			} else {
				params.push({
					key: 'ModelManager_DownloadRef',
					value: encodeParamValue({
						key: 'ModelManager_DownloadRef',
						value: bundle.ref,
						type: 'String'
					}),
					is_compressed: false
				});
			}

			await Athenav0Client.POST('/settings/{deviceId}', {
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
				if (type === 'usbgpu') {
					currentBigModelShortName = undefined;
				} else {
					currentSmallModelShortName = undefined;
				}
				downloadingRef = undefined;
				downloadRefConfirmed = false;
			} else {
				downloadingRef = bundle.ref;
				downloadRefConfirmed = false;
			}

			selectedModelRef = undefined;
			sendingModelType = undefined;

			// Device processes DownloadRef at ~1Hz; poll after a short delay
			setTimeout(() => fetchModelsForDevice(true), 1500);
		} catch (e: unknown) {
			const message = (e as Error)?.message || 'Failed to send model to device.';
			console.error('Error sending model to device:', e);
			toast.error(message);
		} finally {
			sendingModelType = undefined;
		}
	}

	async function sendModelToDevice() {
		if (selectedModel) {
			await pushModelToDevice(selectedModel, activeModelTab);
		}
	}

	async function resetToDefaultModel(type: 'qcom' | 'usbgpu') {
		// Optimistic UI: immediately show default model, close modal
		const previousModel = type === 'usbgpu' ? currentBigModelShortName : currentSmallModelShortName;
		if (type === 'usbgpu') {
			currentBigModelShortName = undefined;
		} else {
			currentSmallModelShortName = undefined;
		}
		resetModalOpen = false;

		try {
			await pushModelToDevice(type === 'usbgpu' ? DEFAULT_BIG_MODEL : DEFAULT_SMALL_MODEL, type);
		} catch {
			// Rollback on failure
			if (type === 'usbgpu') {
				currentBigModelShortName = previousModel;
			} else {
				currentSmallModelShortName = previousModel;
			}
		}
	}

	async function clearModelsCache() {
		if (!logtoClient || !deviceState.selectedDeviceId) return;

		try {
			clearingCache = true;
			await Athenav0Client.POST('/settings/{deviceId}', {
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
			toast.success('Models cache cleared successfully!');
		} catch (e) {
			console.error('Error clearing models cache:', e);
			toast.error('Failed to clear models cache.');
		} finally {
			clearingCache = false;
			clearCacheModalOpen = false;
		}
	}

	async function cancelDownload() {
		if (!logtoClient || !deviceState.selectedDeviceId) return;
		if (downloadingRef === undefined) return;
		const did = deviceState.selectedDeviceId;

		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;

			// Clear the download ref on the device to cancel download
			await Athenav0Client.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: did
					}
				},
				body: [
					{
						key: 'ModelManager_DownloadRef',
						value: encodeParamValue({
							key: 'ModelManager_DownloadRef',
							value: '',
							type: 'String'
						}),
						is_compressed: false
					}
				],
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			downloadingRef = undefined;
			downloadRefConfirmed = false;
			toast.success('Download cancelled');
		} catch (e) {
			console.error('Error cancelling model download:', e);
			toast.error('Failed to cancel download.');
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
			'Release models are the models that made release for openpilot so ideally they should be what a user wants for a "stable" Experience',
		master:
			'master models are the models that made it to openpilot master which every new model there should ideally be better than the prior model there.',
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
	syncStatus={qcomModelList || usbgpuModelList ? sync.status : undefined}
	loading={!!(loadingModels || isCheckingStatus) && !(qcomModelList || usbgpuModelList)}
	onRefresh={async () => {
		if (!deviceId || !logtoClient) return;
		// Master invalidation signal — also drives the valuesStale $effect so
		// the spinner shows "Refreshing..." instantly and consumers re-fetch.
		deviceState.invalidateAll(deviceId);
		try {
			const token = await logtoClient.getIdToken();
			if (!token) return;
			await Promise.all([
				checkDeviceStatus(deviceId, token, true, false),
				fetchModelsForDevice(true)
			]);
		} finally {
			// Clear stale so the title-bar sync indicator can transition to "synced"
			deviceState.valuesStale[deviceId] = false;
		}
	}}
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
	{:else if (loadingModels || isCheckingStatus) && !(qcomModelList || usbgpuModelList)}
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
			<div
				class="flex items-center gap-2.5 rounded-lg border px-4 py-2.5
				{isError
					? 'border-orange-500/20 bg-orange-50 dark:bg-orange-500/5'
					: 'border-amber-500/20 bg-amber-50 dark:bg-yellow-500/5'}"
			>
				{#if isError}
					<AlertTriangle size={16} class="shrink-0 text-orange-600 dark:text-orange-400" />
					<div class="flex-1">
						<p class="text-sm text-orange-800 dark:text-orange-200/80">
							<span class="font-medium">Connection error</span> — {deviceState.lastErrorMessages[
								deviceState.selectedDeviceId || ''
							] || 'Unable to reach device.'} Showing cached models.
						</p>
						{#if lastRetryAt}
							<p class="mt-0.5 text-[0.6875rem] text-orange-600/60 dark:text-orange-300/50">
								Checked {formatRelativeTime(lastRetryAt)}
							</p>
						{/if}
					</div>
				{:else}
					<WifiOff size={16} class="shrink-0 text-amber-600 dark:text-yellow-500" />
					<div class="flex-1">
						<p class="text-sm text-amber-800 dark:text-yellow-200/80">
							{#if retryFailed}
								<span class="font-medium">Still offline</span> — Device not reachable. Showing cached
								models.
							{:else}
								<span class="font-medium">Offline</span> — Showing cached models. Changes disabled until
								device is online.
							{/if}
						</p>
						{#if lastRetryAt}
							<p class="mt-0.5 text-[0.6875rem] text-amber-600/60 dark:text-yellow-300/50">
								Checked {formatRelativeTime(lastRetryAt)}
							</p>
						{/if}
					</div>
				{/if}
				<button
					class="btn shrink-0 btn-ghost transition-all duration-100 btn-xs active:scale-[0.94] active:bg-[var(--sl-bg-subtle)] disabled:active:scale-100 {isError
						? 'text-orange-700 dark:text-orange-400'
						: 'text-yellow-700 dark:text-yellow-400'}"
					disabled={retrying}
					onclick={handleRetry}
				>
					{#if retrying}
						<span class="loading loading-xs loading-spinner"></span>
						Checking...
					{:else}
						<RefreshCw size={14} />
						Retry
					{/if}
				</button>
			</div>
		{/if}
		<div>
			{#if activeModelCards.length > 0}
				<div class="mt-2 px-4">
					<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Active Models</p>
				</div>
				<div
					class="mt-3 overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
				>
					{#snippet modelActions(card: ActiveModelCard)}
						{@const downloading =
							downloadingRef !== undefined &&
							card.model.ref === downloadingRef &&
							card.model.short_name !== card.activeShortName}
						{#if sendingModelType === card.type}
							<div class="flex items-center gap-2 text-xs text-[var(--sl-text-2)]">
								<span class="loading loading-xs loading-spinner"></span>
								Sending...
							</div>
						{:else if downloading}
							<div class="flex items-center gap-3 text-xs text-[var(--sl-text-2)]">
								<span class="loading loading-xs loading-spinner"></span>
								Downloading
								<button
									class="text-[0.75rem] text-[var(--sl-text-2)] transition-all duration-100 hover:text-red-600 active:scale-[0.94] active:opacity-80 disabled:opacity-40 disabled:active:scale-100 dark:hover:text-red-400"
									onclick={cancelDownload}
									disabled={sendingModel}
									title="Cancel the download and clear the download ref on the device"
								>
									Cancel Download
								</button>
							</div>
						{/if}
						{#if card.activeShortName !== undefined && !downloading}
							<button
								class="text-[0.75rem] text-[var(--sl-text-2)] transition-all duration-100 hover:text-[var(--sl-text-1)] active:scale-[0.94] active:opacity-80 disabled:opacity-40 disabled:active:scale-100"
								onclick={() => {
									resetModalType = card.type;
									resetModalOpen = true;
								}}
								disabled={sendingModel}
								title={!isOffroad ? 'Device must be offroad' : undefined}
							>
								Reset to Default
							</button>
						{/if}
					{/snippet}
					{#each activeModelCards as card (card.type)}
						<div
							class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--sl-border-muted)] px-4 py-4 last:border-b-0 {sendingModel
								? 'opacity-60'
								: ''} transition-opacity duration-200"
						>
							<div class="flex min-w-0 items-center gap-3">
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sl-bg-elevated)]"
								>
									{#if card.type === 'qcom'}
										<Cpu size={14} class="text-[var(--sl-text-2)]" />
									{:else}
										<Gpu size={14} class="text-[var(--sl-text-2)]" />
									{/if}
								</div>
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<span
											class="flex min-w-[6rem] shrink-0 items-center justify-center rounded bg-[var(--sl-bg-elevated)] px-1.5 py-0.5 text-center font-mono text-[0.6875rem] text-[var(--sl-text-3)]"
											>{card.label}</span
										>
										<code
											class="shrink-0 rounded bg-[var(--sl-bg-elevated)] px-1.5 py-0.5 font-mono text-[0.6875rem] text-[var(--sl-text-3)]"
											>{card.model.short_name}</code
										>
										<span class="truncate text-sm font-medium text-[var(--sl-text-1)]"
											>{card.model.display_name}</span
										>
									</div>
								</div>
							</div>
							<div class="ml-auto flex shrink-0 items-center gap-x-3">
								{@render modelActions(card)}
							</div>
						</div>
					{/each}
					<div
						class="flex items-center justify-end gap-3 border-t border-[var(--sl-border-muted)] px-4 py-2.5"
					>
						<button
							class="text-[0.75rem] text-[var(--sl-text-2)] transition-all duration-100 hover:text-red-600 active:scale-[0.94] active:opacity-80 disabled:opacity-40 disabled:active:scale-100 dark:hover:text-red-400"
							onclick={() => (clearCacheModalOpen = true)}
							disabled={clearingCache}
							title={!isOffroad ? 'Device must be offroad' : undefined}
						>
							Clear Models Cache
						</button>
					</div>
				</div>
			{/if}

			<div class="mt-12 px-4">
				<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Available Models</p>
			</div>

			<div
				class="relative mt-3 overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]"
			>
				<div
					class="flex items-end gap-1 border-b border-[var(--sl-border-muted)] bg-[var(--sl-bg-surface)] px-4 pt-2.5"
				>
					<button
						class="rounded-t-lg border-b-2 px-4 py-2 text-[0.8125rem] font-medium transition-colors {activeModelTab ===
						'qcom'
							? 'border-primary text-[var(--sl-text-1)]'
							: 'border-transparent text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]'}"
						onclick={() => switchModelTab('qcom')}
					>
						Small Model
					</button>
					<button
						class="rounded-t-lg border-b-2 px-4 py-2 text-[0.8125rem] font-medium transition-colors {activeModelTab ===
						'usbgpu'
							? 'border-primary text-[var(--sl-text-1)]'
							: 'border-transparent text-[var(--sl-text-3)] hover:text-[var(--sl-text-2)]'}"
						onclick={() => switchModelTab('usbgpu')}
					>
						Big Models
					</button>
					<span class="ml-auto pb-2.5 text-[0.75rem] text-[var(--sl-text-3)]">
						{activeModelList?.length ?? 0} models
					</span>
				</div>
				<div class="border-b border-[var(--sl-border-muted)] bg-[var(--sl-bg-surface)] px-4 py-2.5">
					<div class="relative">
						<input
							type="text"
							placeholder="Search models..."
							class="w-full rounded-lg border-none bg-[var(--sl-bg-input)] py-2 pr-9 pl-9 text-[0.8125rem] text-[var(--sl-text-1)] placeholder:text-[var(--sl-text-3)] focus:ring-1 focus:ring-[var(--sl-border)] focus:outline-none"
							bind:value={searchQuery}
						/>
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
							<Search size={14} class="text-[var(--sl-text-3)]" />
						</div>
						{#if searchQuery}
							<button
								type="button"
								class="absolute inset-y-0 right-0 flex items-center pr-2.5 text-[var(--sl-text-3)] transition-all duration-100 hover:text-[var(--sl-text-2)] active:scale-[0.88] active:opacity-80"
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

				<div class="relative">
					{#if loadingModels && !activeModelList}
						<div class="p-6 text-center text-[var(--sl-text-3)]">
							<span class="loading loading-spinner text-primary"></span>
						</div>
					{:else if groupedModels.length === 0}
						<div class="p-6 text-center text-[var(--sl-text-3)]">
							{#if searchQuery}
								No models available matching "{searchQuery}"
							{:else}
								No models available
							{/if}
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
											<Star
												size={16}
												class="fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
											/>
										{:else}
											<Folder size={16} class="text-primary" />
										{/if}
										<div class="flex items-center gap-2">
											<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]"
												>{group.name}</span
											>
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
												{@const favKeyState =
													toggledFavRefs.has(model.ref) && deviceState.selectedDeviceId
														? batchPush.getKeyState(
																deviceState.selectedDeviceId,
																'ModelManager_Favs'
															)
														: undefined}
												{@const isFavSyncing = favKeyState === 'syncing'}
												<div
													role="button"
													tabindex="0"
													class="group flex w-full items-center justify-between px-4 py-3.5 pl-11 text-left transition-all hover:bg-[var(--sl-bg-subtle)]"
													class:opacity-50={isFavSyncing}
													class:pointer-events-none={isFavSyncing}
													onclick={() =>
														(selectedModelRef =
															selectedModelRef === model.ref ? undefined : model.ref)}
													onkeydown={(e) => {
														if (e.key === 'Enter' || e.key === ' ') {
															e.preventDefault();
															selectedModelRef =
																selectedModelRef === model.ref ? undefined : model.ref;
														}
													}}
												>
													<div class="flex items-center gap-2">
														<span class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
															{model.display_name}
														</span>
														{#if favKeyState === 'pending'}
															<span
																class="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-[3px] text-[0.625rem] leading-none font-semibold text-amber-700 dark:text-amber-400"
																>Pending</span
															>
														{:else if isFavSyncing}
															<span class="loading loading-xs loading-spinner text-primary"></span>
														{:else if favKeyState === 'confirmed'}
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="12"
																height="12"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2.5"
																stroke-linecap="round"
																stroke-linejoin="round"
																class="text-emerald-600 dark:text-emerald-400"
																><path d="M20 6 9 17l-5-5" /></svg
															>
														{/if}
													</div>
													<div class="flex items-center gap-2">
														<button
															class="p-1.5 text-[var(--sl-text-3)] transition-all duration-150 hover:text-amber-600 active:scale-90 dark:hover:text-amber-400"
															class:pointer-events-none={isFavSyncing}
															onclick={(e) => {
																e.stopPropagation();
																toggleFavorite(model, e);
															}}
															title={favorites.has(model.ref)
																? 'Remove from Favorites'
																: 'Add to Favorites'}
														>
															<Star
																size={14}
																class="transition-all duration-150 {favorites.has(model.ref)
																	? 'scale-110 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400'
																	: 'scale-100'}"
															/>
														</button>
														<ChevronRight
															size={14}
															class="text-[var(--sl-text-3)] transition-transform duration-150 {selectedModelRef ===
															model.ref
																? 'rotate-90'
																: ''}"
														/>
													</div>
												</div>
												{#if selectedModelRef === model.ref}
													<div
														transition:slide={{ duration: 150 }}
														class="border-t border-[var(--sl-border-muted)] bg-[var(--sl-bg-surface)]/60 px-4 py-4 pl-11"
													>
														<div class="flex items-start justify-between gap-4">
															<div class="min-w-0 flex-1">
																<div class="flex max-w-xs flex-col gap-1.5 text-xs">
																	<div class="flex items-baseline justify-between">
																		<span class="text-[var(--sl-text-3)]">Short Name</span>
																		<span class="text-[var(--sl-text-2)]">{model.short_name}</span>
																	</div>
																	<div class="flex items-baseline justify-between">
																		<span class="text-[var(--sl-text-3)]">Build Date</span>
																		<span class="text-[var(--sl-text-2)]"
																			>{model.build_time
																				? new Date(model.build_time).toLocaleDateString(undefined, {
																						year: 'numeric',
																						month: 'short',
																						day: 'numeric'
																					})
																				: 'Unknown'}</span
																		>
																	</div>
																</div>
															</div>
														</div>
														{#if !isOffroad}
															<p class="mt-3 text-xs text-amber-700 dark:text-amber-400">
																Device is onroad. Models cannot be changed while driving.
															</p>
														{/if}
														<div class="mt-4 flex items-center gap-3">
															{#if currentTabModel?.short_name === model.short_name}
																<div
																	class="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
																>
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		width="12"
																		height="12"
																		viewBox="0 0 24 24"
																		fill="none"
																		stroke="currentColor"
																		stroke-width="2.5"
																		stroke-linecap="round"
																		stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg
																	>
																	Active
																</div>
															{:else}
																<button
																	class="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/80 disabled:opacity-40"
																	onclick={() => sendModelToDevice()}
																	disabled={sendingModel ||
																		!isOffroad ||
																		downloadingRef !== undefined}
																>
																	{#if sendingModel}
																		<span class="loading mr-1 loading-xs loading-spinner"></span>
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
				{@const modelsPanel = schemaState.schemas[deviceState.selectedDeviceId]?.panels?.find(
					(p) => p.id === 'models'
				)}
				{#if modelsPanel}
					<div class="mt-12">
						<SchemaPanel
							deviceId={deviceState.selectedDeviceId}
							panel={modelsPanel}
							loadingValues={loadingModels}
						/>
					</div>
				{:else if currentSmallModel || currentBigModel}
					<!-- Schema-driven: enablement rules in settings_ui.json gate disable state.
					     NNLC is the only remaining frontend-side conditional and exists solely for
					     legacy model support. Drop the `nnlcParam && isLegacyActive` line below
					     when legacy mode is removed. -->
					{@const modelSettingItems = [
						cameraOffsetParam,
						lagdToggleParam,
						lagdToggleDelayParam,
						laneTurnDesireParam,
						laneTurnValueParam,
						nnlcParam && isLegacyActive ? nnlcParam : null
					].filter((p): p is NonNullable<typeof p> => p !== null)}
					{#if modelSettingItems.length > 0 && deviceState.selectedDeviceId}
						{@const modelPanel: Panel = {
							id: 'model-settings',
							label: 'Model Settings',
							icon: 'models',
							order: 0,
							remote_configurable: true,
							items: modelSettingItems.map(settingToSchemaItem)
						}}
						<div class="mt-12 px-4">
							<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Model Settings</p>
						</div>
						<div class="mt-3">
							<SchemaPanel
								deviceId={deviceState.selectedDeviceId}
								panel={modelPanel}
								loadingValues={loadingModels}
							/>
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
	message="Are you sure you want to reset to the default {resetModalType === 'usbgpu'
		? 'big'
		: 'small'} driving model? This will clear the active bundle on the device."
	confirmText="Reset to Default"
	variant="danger"
	isProcessing={sendingModel}
	onConfirm={() => resetToDefaultModel(resetModalType)}
/>

<ConfirmationModal
	bind:open={clearCacheModalOpen}
	title="Clear Models Cache"
	message="Are you sure you want to clear the models cache on this device? This will remove all downloaded models except the active one."
	confirmText="Clear Models Cache"
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
		toast.success('Settings pushed successfully!');
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
