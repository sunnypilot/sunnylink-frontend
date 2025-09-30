<script lang="ts">
	import { createAuthMiddleware } from '$lib/api/auth';
	import { sunnylinkClient } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import { type Device } from '$lib/types/types';
	import { type ModelsV7, type ModelBundle } from '$lib/types/models-v7';
	import ToggleSetting from '$lib/components/settings/ToggleSetting.svelte';
	import SelectSetting from '$lib/components/settings/SelectSetting.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	let { data } = $props();

	let allDevices = $state<Device>([]);
	let selectedModel = $state<number>();
	let selectedDevice = $state<string>('');
	let sendingModel = $state<Boolean>(false);
	let deploymentAnimation = $state<Boolean>(false);
	let deploymentProgress = $state<number>(0);
	let loading = $state(true);
	let models = $state<ModelBundle[]>([]);

	// Dropdown states
	let deviceDropdownOpen = $state(false);
	let modelDropdownOpen = $state(false);
	let deviceSearch = $state('');
	let modelSearch = $state('');

	// Filtered options
	let filteredDevices = $derived(
		allDevices.filter((device) =>
			(device.device_id ?? '').toLowerCase().includes(deviceSearch.toLowerCase())
		)
	);

	let filteredModels = $derived(
		models.filter((model) => model.display_name.toLowerCase().includes(modelSearch.toLowerCase()))
	);

	type SettingType = 'bool' | 'int' | 'string' | 'select';
	type SettingCategory = 'device' | 'toggles' | 'steering' | 'cruise' | 'visuals' | 'developer';

	type SettingDefinition = {
		key: string;
		label: string;
		type: SettingType;
		category: SettingCategory;
		description?: string;
		options?: Array<{ label: string; value: number }>;
		subsection?: string;
	};

	type DeviceSettingState = {
		definition: SettingDefinition;
		value: boolean | number | string | null;
		encodedValue: string | null;
		loading: boolean;
	};

	const BRIGHTNESS_OPTIONS: Array<{ label: string; value: number }> = Array.from(
		{ length: 11 },
		(_, index) => {
			const value = index * 10;
			return { value, label: `${value}%` };
		}
	);

	const PERSONALITY_OPTIONS = [
		{ value: 0, label: 'Aggressive' },
		{ value: 1, label: 'Standard' },
		{ value: 2, label: 'Relaxed' }
	];

	const SETTINGS_DEFINITIONS: SettingDefinition[] = [
		// Device Category
		{ key: 'MaxTimeOffroad', label: 'Max Time Offroad', type: 'int', category: 'device' },
		{ key: 'DeviceBootMode', label: 'Wake Up Behavior', type: 'select', category: 'device' },
		{ key: 'InteractivityTimeout', label: 'Interactivity Timeout', type: 'int', category: 'device' },
		{ key: 'Brightness', label: 'Brightness', type: 'int', category: 'device', options: BRIGHTNESS_OPTIONS },
		{ key: 'QuietMode', label: 'Quiet Mode', type: 'bool', category: 'device' },

		// Toggles Category
		{ key: 'OpenpilotEnabledToggle', label: 'Enable Sunnypilot', type: 'bool', category: 'toggles' },
		{ key: 'ExperimentalMode', label: 'Experimental Mode', type: 'bool', category: 'toggles' },
		{ key: 'DynamicExperimentalControl', label: 'Enable Dynamic Experimental Control', type: 'bool', category: 'toggles' },
		{ key: 'DisengageOnAccelerator', label: 'Disengage on Accelerator Pedal', type: 'bool', category: 'toggles' },
		{ key: 'LongitudinalPersonality', label: 'Driving Personality', type: 'select', category: 'toggles', options: PERSONALITY_OPTIONS },
		{ key: 'IsLdwEnabled', label: 'Enable Lane Departure Warnings', type: 'bool', category: 'toggles' },
		{ key: 'AlwaysOnDM', label: 'Always On Driver Monitoring', type: 'bool', category: 'toggles' },
		{ key: 'RecordFront', label: 'Record and Upload Driver Camera', type: 'bool', category: 'toggles' },
		{ key: 'RecordAudio', label: 'Record and Upload Microphone Audio', type: 'bool', category: 'toggles' },
		{ key: 'IsMetric', label: 'Use Metric System', type: 'bool', category: 'toggles' },

		// Steering Category
		{ key: 'Mads', label: 'Modular Assistive Driving System (MADS)', type: 'bool', category: 'steering' },
		{ key: 'MadsMainCruiseAllowed', label: 'Toggle With Main Cruise', type: 'bool', category: 'steering', subsection: 'MADS' },
		{ key: 'MadsUnifiedEngagementMode', label: 'Unified Engagement Mode (UEM)', type: 'bool', category: 'steering', subsection: 'MADS' },
		{ key: 'MadsSteeringMode', label: 'Steering Mode on Brake Pedal', type: 'bool', category: 'steering', subsection: 'MADS' },
		{ key: 'AutoLaneChangeTimer', label: 'Auto Lane Change By Blinker', type: 'int', category: 'steering', subsection: 'Customize Lane Change' },
		{ key: 'AutoLaneChangeBsmDelay', label: 'Auto Lane Change: Delay With Blind Spot', type: 'int', category: 'steering', subsection: 'Customize Lane Change' },
		{ key: 'BlinkerPauseLateralControl', label: 'Pause Lateral Control with Blinker', type: 'bool', category: 'steering' },
		{ key: 'NeuralNetworkLateralControl', label: 'Neural Network Lateral Control (NNLC)', type: 'bool', category: 'steering' },

		// Cruise Category
		{ key: 'IntelligentCruiseButtonManagement', label: 'Intelligent Cruise Button Management (ICBM) (Alpha)', type: 'bool', category: 'cruise' },
		{ key: 'SmartCruiseControlVision', label: 'Smart Cruise Control - Vision', type: 'bool', category: 'cruise' },
		{ key: 'SmartCruiseControlMap', label: 'Smart Cruise Control - Map', type: 'bool', category: 'cruise' },
		{ key: 'CustomAccIncrementsEnabled', label: 'Custom ACC Speed Increments', type: 'bool', category: 'cruise' },
		{ key: 'SpeedLimitMode', label: 'Speed Limit', type: 'bool', category: 'cruise', subsection: 'Speed Limit' },
		{ key: 'SpeedLimitPolicy', label: 'Speed Limit Source', type: 'select', category: 'cruise', subsection: 'Speed Limit > Customize' },

		// Visuals Category
		{ key: 'BlindSpot', label: 'Show Blind Spot Warnings', type: 'bool', category: 'visuals' },
		{ key: 'RainbowMode', label: 'Enable Tesla Rainbow Mode', type: 'bool', category: 'visuals' },
		{ key: 'StandstillTimer', label: 'Enable Standstill Timer', type: 'bool', category: 'visuals' },
		{ key: 'RoadNameToggle', label: 'Display Road Name', type: 'bool', category: 'visuals' },
		{ key: 'ChevronInfo', label: 'Display Metrics Below Chevron', type: 'bool', category: 'visuals' },
		{ key: 'DevUIInfo', label: 'Developer UI', type: 'bool', category: 'visuals' },

		// Developer Category
		{ key: 'AdbEnabled', label: 'Enable ADB', type: 'bool', category: 'developer' },
		{ key: 'SshEnabled', label: 'Enable SSH', type: 'bool', category: 'developer' },
		{ key: 'JoystickDebugMode', label: 'Joystick Debug Mode', type: 'bool', category: 'developer' },
		{ key: 'LongitudinalManeuverMode', label: 'Longitudinal Maneuver Mode', type: 'bool', category: 'developer' },
		{ key: 'AlphaLongitudinalEnabled', label: 'openpilot Longitudinal Control (Alpha)', type: 'bool', category: 'developer' },
		{ key: 'ShowAdvancedControls', label: 'Show Advanced Controls', type: 'bool', category: 'developer' },
		{ key: 'EnableGithubRunner', label: 'Enable GitHub runner service', type: 'bool', category: 'developer' },
		{ key: 'EnableCopyparty', label: 'Enable copyparty service', type: 'bool', category: 'developer' }
	];

	let activeCategory = $state<SettingCategory>('device');
	let loadedCategories = $state<Set<SettingCategory>>(new Set(['device']));

	const categorySettings = $derived(() => {
		return SETTINGS_DEFINITIONS.filter(def => def.category === activeCategory);
	});

	const categoryKeys = $derived(() => {
		return SETTINGS_DEFINITIONS
			.filter(def => loadedCategories.has(def.category))
			.map(def => def.key);
	});

	function createEmptySettingsState(): Record<string, DeviceSettingState> {
		const state: Record<string, DeviceSettingState> = {};

		// Only create state for settings we have definitions for
		for (const definition of SETTINGS_DEFINITIONS) {
			state[definition.key] = {
				definition,
				value: null,
				encodedValue: null,
				loading: false
			};
		}

		return state;
	}

	let deviceSettings = $state<Record<string, DeviceSettingState>>(createEmptySettingsState());
	let settingsLoading = $state<boolean>(false);
	let settingsError = $state<string | null>(null);

	function decodeBase64Value(value: string | null | undefined): string | null {
		if (!value) {
			return null;
		}
		if (typeof globalThis.atob === 'function') {
			try {
				return globalThis.atob(value);
			} catch (error) {
				console.warn('Unable to decode setting value in browser', error);
			}
		}
		const bufferConstructor = (globalThis as any).Buffer;
		if (bufferConstructor) {
			return bufferConstructor.from(value, 'base64').toString('utf-8');
		}
		return null;
	}

	function encodeBase64Value(value: string): string {
		if (typeof globalThis.btoa === 'function') {
			return globalThis.btoa(value);
		}
		const bufferConstructor = (globalThis as any).Buffer;
		if (bufferConstructor) {
			return bufferConstructor.from(value, 'utf-8').toString('base64');
		}
		throw new Error('Base64 encoding is not available in this environment');
	}

	function decodeSettingValue(definition: SettingDefinition, encodedValue: string | null): boolean | number | string | null {
		const decoded = decodeBase64Value(encodedValue);
		if (decoded === null) {
			return null;
		}
		if (definition.type === 'bool') {
			const normalized = decoded.toLowerCase();
			return normalized === '1' || normalized === 'true';
		}
		if (definition.type === 'int') {
			const parsed = Number.parseInt(decoded, 10);
			return Number.isNaN(parsed) ? null : parsed;
		}
		// For readonly, string, and other types, return the decoded string
		return decoded;
	}

	function encodeSettingValue(definition: SettingDefinition, value: boolean | number): string {
		if (definition.type === 'bool') {
			return encodeBase64Value(value ? '1' : '0');
		}
		if (definition.type === 'int') {
			return encodeBase64Value(value.toString());
		}
		return encodeBase64Value(String(value));
	}

	async function loadCategorySettings(category: SettingCategory) {
		if (loadedCategories.has(category) || !selectedDevice) {
			return;
		}

		const newKeys = SETTINGS_DEFINITIONS
			.filter(def => def.category === category)
			.map(def => def.key);

		try {
			const response = await sunnylinkClient.GET('/settings/{deviceId}/values', {
				params: {
					path: { deviceId: selectedDevice },
					query: { paramKeys: newKeys }
				}
			});

			if (response.error) {
				throw new Error(response.error.detail ?? 'Failed to load settings');
			}

			const settingsPayload = response.data?.settings ?? {};

			for (const key of newKeys) {
				if (key in settingsPayload && key in deviceSettings) {
					const encodedValue = settingsPayload[key] ?? null;
					const definition = deviceSettings[key].definition;
					deviceSettings[key] = {
						definition,
						encodedValue,
						value: decodeSettingValue(definition, encodedValue),
						loading: false
					};
				}
			}

			loadedCategories.add(category);
		} catch (error) {
			console.error(`Error loading ${category} settings:`, error);
			toast.error(`Failed to load ${category} settings`);
		}
	}

	function switchCategory(category: SettingCategory) {
		activeCategory = category;
		if (!loadedCategories.has(category)) {
			void loadCategorySettings(category);
		}
	}

	async function loadSettingsForDevice(deviceId: string) {
		if (!deviceId) {
			deviceSettings = createEmptySettingsState();
			return;
		}
		const requestDeviceId = deviceId;
		settingsLoading = true;
		settingsError = null;
		deviceSettings = createEmptySettingsState();
		try {
			const response = await sunnylinkClient.GET('/settings/{deviceId}/values', {
				params: {
					path: {
						deviceId
					},
					query: {
						paramKeys: categoryKeys()
					}
				}
			});

			if (response.error) {
				throw new Error(response.error.detail ?? 'Failed to load settings');
			}

			if (selectedDevice !== requestDeviceId) {
				return;
			}

			const settingsPayload = response.data?.settings ?? {};

			// Update settings that came back from the API
			for (const key of categoryKeys()) {
				if (key in settingsPayload && key in deviceSettings) {
					const encodedValue = settingsPayload[key] ?? null;
					const definition = deviceSettings[key].definition;
					deviceSettings[key] = {
						definition,
						encodedValue,
						value: decodeSettingValue(definition, encodedValue),
						loading: false
					};
				}
			}
		} catch (error) {
			console.error('Error loading device settings:', error);
			if (selectedDevice === requestDeviceId) {
				settingsError = 'Unable to load device settings right now.';
				toast.error('Failed to load device settings');
			}
		} finally {
			if (selectedDevice === requestDeviceId) {
				settingsLoading = false;
			}
		}
	}

	async function persistSetting(definition: SettingDefinition, value: boolean | number) {
		if (!selectedDevice) {
			toast.error('Select a device before updating settings');
			return;
		}
		const requestDeviceId = selectedDevice;
		const previousState = deviceSettings[definition.key] ?? {
			definition,
			value: null,
			encodedValue: null,
			loading: false
		};

		if (previousState.loading) {
			return;
		}

		if (previousState.value === value) {
			return;
		}

		const encodedValue = encodeSettingValue(definition, value);

		deviceSettings = {
			...deviceSettings,
			[definition.key]: {
				...previousState,
				value,
				loading: true
			}
		};

		try {
			const response = await sunnylinkClient.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: requestDeviceId
					}
				},
				body: [
					{
						key: definition.key,
						value: encodedValue,
						is_compressed: false
					}
				]
			});

			if (response.error) {
				throw new Error(response.error.detail ?? 'Failed to update setting');
			}

			if (selectedDevice !== requestDeviceId) {
				return;
			}

			deviceSettings = {
				...deviceSettings,
				[definition.key]: {
					...deviceSettings[definition.key],
					value,
					encodedValue,
					loading: false
				}
			};
			toast.success(`${definition.label} updated`);
		} catch (error) {
			console.error('Error updating device setting:', error);
			if (selectedDevice === requestDeviceId) {
				deviceSettings = {
					...deviceSettings,
					[definition.key]: {
						...previousState,
						loading: false
					}
				};
				toast.error(`Failed to update ${definition.label}`);
			}
		}
	}

	function handleBooleanSettingChange(definition: SettingDefinition, value: boolean) {
		void persistSetting(definition, value);
	}

	function handleNumberSettingChange(definition: SettingDefinition, value: number | null) {
		if (value === null) {
			return;
		}
		void persistSetting(definition, value);
	}

	function getBooleanSettingValue(key: string): boolean {
		return deviceSettings[key]?.value === true;
	}

	function getNumericSettingValue(key: string): number | null {
		const candidate = deviceSettings[key]?.value;
		return typeof candidate === 'number' ? candidate : null;
	}

	function isSettingSaving(key: string): boolean {
		return deviceSettings[key]?.loading ?? false;
	}

	onMount(async () => {
		// Add click outside listener
		document.addEventListener('click', handleClickOutside);

		if (data.user) {
			try {
				// Load models
				const modelsResponse = await fetch('https://docs.sunnypilot.ai/driving_models_v7.json');
				const modelsJson: ModelsV7 = await modelsResponse.json();
				models = modelsJson.bundles.reverse();

				// Load devices
				const idToken = await data.logtoClient?.getIdToken();
				const authMiddleware = createAuthMiddleware(idToken ?? '');
				sunnylinkClient.use(authMiddleware);
				const devices = await sunnylinkClient.GET('/users/{userId}/devices', {
					params: { path: { userId: 'self' } }
				});
				allDevices = devices.data!;
				if (allDevices.length === 1) {
					selectedDevice = allDevices[0].device_id ?? '';
					if (selectedDevice) {
						await loadSettingsForDevice(selectedDevice);
					}
				}
				loading = false;
			} catch (error: any) {
				console.error('Error loading data:', error);
				toast.error('Failed to load dashboard data');
				loading = false;
			}
		}
	});

	onDestroy(() => {
		document.removeEventListener('click', handleClickOutside);
	});

	async function sendNewModelToDevice() {
		if (!selectedModel || !selectedDevice) {
			toast.error('Please select both a device and model');
			return;
		}

		sendingModel = true;
		deploymentAnimation = true;
		deploymentProgress = 0;

		const progressInterval = setInterval(() => {
			deploymentProgress = Math.min(deploymentProgress + Math.random() * 15, 95);
		}, 200);

		try {
			const response = await sunnylinkClient.POST('/settings/{deviceId}', {
				params: {
					path: {
						deviceId: selectedDevice ?? ''
					}
				},
				body: [
					{
						key: 'ModelManager_DownloadIndex',
						value: btoa(selectedModel?.toString() ?? ''),
						is_compressed: false
					}
				]
			});

			if (response.error) {
				throw new Error(`HTTP error! Status: ${response.error.detail}`);
			}

			clearInterval(progressInterval);
			deploymentProgress = 100;

			toast.success('Download requested. Check your device for current status. Drive safely! 🚗💨');

			// Keep animation for a bit longer to show success
			setTimeout(() => {
				deploymentAnimation = false;
				deploymentProgress = 0;
			}, 2000);
			sendingModel = false;
			selectedModel = undefined;
		} catch (error: any) {
			clearInterval(progressInterval);
			toast.error('Ah nuts 🔩. We encountered an error');
			console.error('Error:', error);
			sendingModel = false;
			deploymentAnimation = false;
			deploymentProgress = 0;
		}
	}

	async function selectDevice(deviceId: string) {
		const previousDevice = selectedDevice;
		selectedDevice = deviceId;
		deviceDropdownOpen = false;
		deviceSearch = '';

		// Reset category state when switching devices
		activeCategory = 'device';
		loadedCategories = new Set(['device']);

		if (deviceId && deviceId !== previousDevice) {
			await loadSettingsForDevice(deviceId);
		}
		if (!deviceId) {
			deviceSettings = createEmptySettingsState();
		}
	}

	function selectModel(modelIndex: number) {
		selectedModel = modelIndex;
		modelDropdownOpen = false;
		modelSearch = '';
	}

	// Close dropdowns when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as Element;
		if (!target.closest('[data-dropdown]')) {
			deviceDropdownOpen = false;
			modelDropdownOpen = false;
		}
	}
</script>

<div class="relative min-h-screen bg-base-100">
	<div class="mx-auto max-w-4xl px-6 py-16">
		{#if !data.user}
			<div class="text-center" in:fade={{ delay: 200, duration: 400 }}>
				<h2 class="mb-3 text-2xl font-medium">Authentication Required</h2>
				<p>Please sign in to access your dashboard.</p>
			</div>
		{:else if loading}
			<div class="flex items-center justify-center py-16" in:fade={{ duration: 300 }}>
				<div class="text-center">
					<div
						class="mb-4 inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"
					></div>
					<p class="text-sm">Loading dashboard...</p>
				</div>
			</div>
		{:else}
			<div class="space-y-8" in:fade={{ delay: 200, duration: 500 }}>
				<!-- Stats Cards -->
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="stats bg-base-300 shadow">
						<div class="stat">
							<div class="stat-title">Connected Devices</div>
							<div class="stat-value text-primary">{allDevices.length}</div>
						</div>
					</div>

					<div class="stats bg-base-300 shadow">
						<div class="stat">
							<div class="stat-title">Available Models</div>
							<div class="stat-value text-secondary">{models.length}</div>
						</div>
					</div>

					<div class="stats bg-base-300 shadow">
						<div class="stat">
							<div class="stat-title">Latest Release</div>
							<div class="stat-value text-accent text-sm">
								{models.length > 0 ? models[0]?.display_name?.split('(')[0].trim() || 'N/A' : 'N/A'}
							</div>
							<div class="stat-desc">
								Gen {models.length > 0 ? models[0]?.generation || '?' : '?'}
							</div>
						</div>
					</div>
				</div>

				<!-- Header -->
				<div class="text-center">
					<h1 class="mb-2 text-2xl font-medium">Deploy Model</h1>
					<p class="text-sm opacity-70">Send models to your openpilot devices</p>
				</div>

				<!-- Form -->
				<div class="mx-auto max-w-2xl space-y-6">
					<!-- Device Selection -->
					<div class="space-y-2">
						<label for="device-select" class="text-sm font-medium">Device</label>
						<div class="relative" data-dropdown>
							<button
								id="device-select"
								onclick={() => (deviceDropdownOpen = !deviceDropdownOpen)}
								class="btn btn-outline w-full justify-between"
							>
								<span>
									{selectedDevice || 'Select a device...'}
								</span>
								<svg
									class="h-4 w-4 transition-transform {deviceDropdownOpen
										? 'rotate-180'
										: ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>

							{#if deviceDropdownOpen}
								<div
									class="dropdown-content menu absolute z-10 mt-1 w-full rounded-box bg-base-100 shadow-lg"
									transition:fly={{ y: -4, duration: 200 }}
								>
									{#if allDevices.length > 1}
										<div class="border-b p-2">
											<input
												bind:value={deviceSearch}
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
													onclick={() => void selectDevice(device.device_id ?? '')}
													class="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-base-200 {selectedDevice ===
													(device.device_id ?? '')
														? 'bg-base-200 font-medium'
														: ''}"
												>
													<div class="flex-1">
														<div class="font-medium">{device.device_id ?? ''}</div>
													</div>
													{#if selectedDevice === (device.device_id ?? '')}
														<svg
															class="h-4 w-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
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

					<!-- Model Selection -->
					<div class="space-y-2">
						<label for="model-select" class="text-sm font-medium">Model</label>
						<div class="relative" data-dropdown>
							<button
								id="model-select"
								onclick={() => (modelDropdownOpen = !modelDropdownOpen)}
								class="btn btn-outline w-full justify-between"
							>
								<span>
									{models.find((m) => m.index === selectedModel)?.display_name ||
										'Select a model...'}
								</span>
								<svg
									class="h-4 w-4 transition-transform {modelDropdownOpen
										? 'rotate-180'
										: ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>

							{#if modelDropdownOpen}
								<div
									class="dropdown-content menu absolute z-10 mt-1 w-full rounded-box bg-base-100 shadow-lg"
									transition:fly={{ y: -4, duration: 200 }}
								>
									<div class="border-b p-2">
										<input
											bind:value={modelSearch}
											placeholder="Search models..."
											class="input input-bordered input-sm w-full"
										/>
									</div>
									<div class="max-h-64 overflow-auto py-1">
										{#if filteredModels.length === 0}
											<div class="px-3 py-2 text-sm opacity-60">No models found</div>
										{:else}
											{#each filteredModels as model}
												<button
													onclick={() => selectModel(model.index)}
													class="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-base-200 {selectedModel ===
													model.index
														? 'bg-base-200 font-medium'
														: ''}"
												>
													<div class="min-w-0 flex-1">
														<div class="truncate font-medium">{model.display_name}</div>
														<div class="text-xs opacity-60">Generation {model.generation}</div>
													</div>
													{#if selectedModel === model.index}
														<svg
															class="h-4 w-4"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
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

					<!-- Deploy Button -->
					<div class="pt-4">
						{#if sendingModel}
							<button
								class="btn btn-primary w-full"
								disabled
							>
								<svg
									class="mr-2 h-4 w-4 animate-spin"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
								Deploying...
							</button>
						{:else}
							<button
								onclick={sendNewModelToDevice}
								disabled={!selectedDevice || selectedModel === undefined || allDevices.length <= 0}
								class="btn btn-primary w-full {!selectedDevice ||
								selectedModel === undefined ||
								allDevices.length <= 0
									? 'btn-disabled'
									: ''}"
							>
								Deploy to Device
							</button>
						{/if}
					</div>

					<!-- Summary -->
					{#if selectedDevice && selectedModel !== undefined}
						<div class="card bg-base-200 p-4" transition:fade={{ duration: 200 }}>
							<div class="space-y-2 text-xs">
								<div class="flex justify-between">
									<span class="opacity-70">Device:</span>
									<span class="font-medium">{selectedDevice}</span>
								</div>
								<div class="flex justify-between">
									<span class="opacity-70">Model:</span>
									<span class="font-medium"
										>{models.find((m) => m.index === selectedModel)?.display_name}</span
									>
								</div>
							</div>
						</div>
					{/if}

					<!-- Device Settings -->
					<div class="space-y-4 border-t border-base-300 pt-6">
						<div class="flex items-center justify-between">
							<h2 class="text-lg font-semibold">Device Settings</h2>
							{#if settingsLoading}
								<span class="loading loading-spinner loading-sm text-primary" aria-hidden="true"></span>
							{/if}
						</div>
						{#if !selectedDevice}
							<p class="text-sm opacity-70">Select a device to view configurable settings.</p>
						{:else if settingsLoading}
							<p class="flex items-center gap-2 text-sm opacity-70">
								<span class="loading loading-spinner loading-xs text-primary" aria-hidden="true"></span>
								<span>Loading settings…</span>
							</p>
						{:else}
							{#if settingsError}
								<div class="alert alert-warning text-sm">
									<span>{settingsError}</span>
								</div>
							{/if}

							<!-- Category Tabs -->
							<div class="tabs tabs-boxed">
								<button
									class="tab {activeCategory === 'device' ? 'tab-active' : ''}"
									onclick={() => switchCategory('device')}
								>
									Device
								</button>
								<button
									class="tab {activeCategory === 'toggles' ? 'tab-active' : ''}"
									onclick={() => switchCategory('toggles')}
								>
									Toggles
								</button>
								<button
									class="tab {activeCategory === 'steering' ? 'tab-active' : ''}"
									onclick={() => switchCategory('steering')}
								>
									Steering
								</button>
								<button
									class="tab {activeCategory === 'cruise' ? 'tab-active' : ''}"
									onclick={() => switchCategory('cruise')}
								>
									Cruise
								</button>
								<button
									class="tab {activeCategory === 'visuals' ? 'tab-active' : ''}"
									onclick={() => switchCategory('visuals')}
								>
									Visuals
								</button>
								<button
									class="tab {activeCategory === 'developer' ? 'tab-active' : ''}"
									onclick={() => switchCategory('developer')}
								>
									Developer
								</button>
							</div>

							<div class="space-y-4">
								{#each categorySettings() as definition (definition.key)}
									{#if definition.type === 'bool'}
											<ToggleSetting
												label={definition.label}
												description={definition.description}
												value={getBooleanSettingValue(definition.key)}
												loading={isSettingSaving(definition.key)}
												disabled={!selectedDevice}
												onChange={(value) => handleBooleanSettingChange(definition, value)}
											/>
										{:else if definition.type === 'int' || definition.type === 'select'}
											<SelectSetting
												label={definition.label}
												description={definition.description}
												options={definition.options ?? []}
												value={getNumericSettingValue(definition.key)}
												loading={isSettingSaving(definition.key)}
												disabled={!selectedDevice}
												onChange={(value) => handleNumberSettingChange(definition, value)}
											/>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Page-wide deployment animation overlay -->
	{#if deploymentAnimation}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-base-100/95 backdrop-blur-sm"
			in:fade={{ duration: 300 }}
			out:fade={{ duration: 300 }}
		>
			<div class="text-center">
				<div class="mb-8">
					<div
						class="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-2xl"
					>
						<svg
							class="h-10 w-10 animate-pulse text-white"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
							></path>
						</svg>
					</div>
				</div>
				<h2 class="mb-2 text-2xl font-semibold">Deploying Model</h2>
				<p class="mb-8 opacity-70">Sending your selected model to the device...</p>

				<!-- Animated progress bars -->
				<div class="w-80 space-y-2">
					<div class="mb-1 flex justify-between text-xs opacity-70">
						<span>Progress</span>
						<span>Uploading...</span>
					</div>
					<div class="h-2 w-full rounded-full bg-base-300">
						<div
							class="h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300 ease-out"
							style="width: {deploymentProgress}%"
						></div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Click outside to close dropdowns */
	:global(body) {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}
</style>
