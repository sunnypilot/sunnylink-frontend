<script lang="ts">
	import { sunnylinkClient, sunnylinkClientV1 } from '$lib/api/client';
	import { type components } from '$lib/types/sunnylink_v1';
	import { toast } from 'svelte-sonner';
	import {
		SETTINGS_DEFINITIONS,
		type SettingCategory,
		type SettingDefinition
	} from '$lib/settings-definitions';
	import ToggleSetting from '$lib/components/settings/ToggleSetting.svelte';
	import SelectSetting from '$lib/components/settings/SelectSetting.svelte';

	interface Props {
		selectedDevice: string;
	}

	let { selectedDevice }: Props = $props();

	interface DeviceSettingState {
		definition: SettingDefinition;
		value: boolean | number | string | null;
		encodedValue: string | null;
		loading: boolean;
		type: string;
	}

	let activeCategory = $state<SettingCategory>('device');
	let deviceSettingsMap = $state<components['schemas']['DeviceParamKey'][] | null>(null);
	let loadedCategories = $state(new Set<SettingCategory>());
	let categoryLoading = $state(false);
	let settingsLoading = $state(false);
	let settingsError = $state<string | null>(null);

	// const categorySettings = $derived.by(() => {
	// 	return SETTINGS_DEFINITIONS.filter((def) => def.category === activeCategory);
	// });

	const createEmptySettingsState = (): Record<string, DeviceSettingState> => {
		const state: Record<string, DeviceSettingState> = {};
		for (const definition of SETTINGS_DEFINITIONS) {
			state[definition.key] = { definition, value: null, encodedValue: null, loading: false, type: "unknown" };
		}
		return state;
	};

	let deviceSettings = $state<Record<string, DeviceSettingState>>(createEmptySettingsState());

	const decodeBase64Value = (value: string | null | undefined): string | null => {
		if (!value) return null;
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
	};

	const encodeBase64Value = (value: string): string => {
		if (typeof globalThis.btoa === 'function') {
			return globalThis.btoa(value);
		}
		const bufferConstructor = (globalThis as any).Buffer;
		if (bufferConstructor) {
			return bufferConstructor.from(value, 'utf-8').toString('base64');
		}
		throw new Error('Base64 encoding is not available in this environment');
	};

	const decodeSettingValue = (
		deviceParam: components['schemas']['DeviceParam']
	): boolean | number | string | null => {
		const decoded = decodeBase64Value(deviceParam.value);
		if (decoded === null) return null;

		if (deviceParam.type?.toLowerCase() === 'string') {
			return decoded;
		}

		if (deviceParam.type?.toLowerCase() === 'bool') {
			const normalized = decoded.toLowerCase();
			return normalized === '1' || normalized === 'true';
		}

		const parsed = Number.parseInt(decoded, 10);
		return Number.isNaN(parsed) ? null : parsed;
	};

	const encodeSettingValue = (definition: components['schemas']['DeviceParam'], value: boolean | number): string => {
		return encodeBase64Value(definition.type?.toLowerCase() === 'bool' ? (value ? '1' : '0') : value.toString());
	};

	const switchCategory = (category: SettingCategory) => {
		activeCategory = category;
	};

	const loadAllCategories = async (deviceId: string) => {
		if (!deviceId) {
			deviceSettings = createEmptySettingsState();
			return;
		}

		const requestDeviceId = deviceId;
		settingsLoading = true;
		settingsError = null;
		deviceSettings = createEmptySettingsState();
		loadedCategories = new Set();

		const categories: SettingCategory[] = ['device', 'toggles', 'steering', 'cruise', 'visuals'];
		const deviceParamQuery = await sunnylinkClientV1.GET('/v1/settings/{deviceId}', { params: { path: { deviceId } } });

		if (deviceParamQuery.data?.items)
			deviceSettingsMap = deviceParamQuery.data?.items;

		try {
			const requests = categories.map(async (category) => {

				const categoryKeys = SETTINGS_DEFINITIONS.filter((def) => def.category === category).map(
					(def) => def.key
				);
				const deviceParams = deviceSettingsMap?.filter((item => categoryKeys.includes(item.key ?? '')));

				if (!deviceParams || deviceParams.length === 0) {
					return { category, response: null, deviceParamKeys: [] };
				}

				try {
					const response = await sunnylinkClientV1.GET('/v1/settings/{deviceId}/values', {
						params: {
							path: { deviceId },
							query: { paramKeys: deviceParams.map(param => param.key) }
						}
					});
					return { category, response, deviceParamKeys: deviceParams };
				} catch (err) {
					console.error(`Error fetching ${category}:`, err);
					return { category, response: null, deviceParamKeys: deviceParams };
				}
			});

			const results = await Promise.all(requests);

			if (selectedDevice !== requestDeviceId) return;

			let hasAnySuccess = false;
			let firstError: any = null;

			for (const { category, response, deviceParamKeys } of results) {
				if (!response || response.error) {
					console.error(`Failed to load ${category} settings:`, response?.error);
					if (!firstError && response?.error) {
						firstError = response.error;
					}
					continue;
				}

				if (!response.data?.items) {
					console.warn(`No settings data for ${category}`);
					loadedCategories.add(category);
					continue;
				}

				hasAnySuccess = true;
				const settingsPayload = response.data.items;

				const newSettings: Record<string, DeviceSettingState> = { ...deviceSettings };

				for (const deviceParamKey of deviceParamKeys) {
					const deviceParam = settingsPayload.find((item) => item.key === deviceParamKey.key);
					const definition = SETTINGS_DEFINITIONS.find(i => i.key === deviceParam?.key);
					if (deviceParam && definition) {
						const deviceSettingState: DeviceSettingState = {
							definition,
							encodedValue: deviceParam.value ?? null,
							value: decodeSettingValue(deviceParam),
							loading: false,
							type: deviceParam.type || 'unknown'
						};
						newSettings[deviceParamKey.key] = deviceSettingState;
					}
				}

				deviceSettings = newSettings;

				loadedCategories.add(category);
			}

			if (!hasAnySuccess && firstError) {
				const errorDetail = firstError.detail || 'Device not found or offline';
				throw new Error(errorDetail);
			}
		} catch (error: any) {
			console.error('Error loading device settings:', error);
			if (selectedDevice === requestDeviceId) {
				const errorMessage = error?.message || 'Unable to load device settings right now.';
				settingsError = errorMessage.includes('not found')
					? 'Device not found. Make sure the device is online.'
					: errorMessage;
				toast.error(settingsError ?? errorMessage);
			}
		} finally {
			if (selectedDevice === requestDeviceId) {
				settingsLoading = false;
			}
		}
	};

	const persistSetting = async (definition: components['schemas']['DeviceParamKey'], value: boolean | number) => {
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

		if (previousState.loading || previousState.value === value) return;
		const param_metadata = SETTINGS_DEFINITIONS.filter((def) => def.key === definition.key)[0];

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
					path: { deviceId: requestDeviceId }
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

			if (selectedDevice !== requestDeviceId) return;

			deviceSettings = {
				...deviceSettings,
				[definition.key]: {
					...deviceSettings[definition.key],
					value,
					encodedValue,
					loading: false
				}
			};
			toast.success(`${param_metadata.label} updated`);
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
				toast.error(`Failed to update ${param_metadata.label}`);
			}
		}
	};

	const handleBooleanSettingChange = (definition: components['schemas']['DeviceParamKey'], value: boolean) => {
		void persistSetting(definition, value);
	};

	const handleNumberSettingChange = (definition: components['schemas']['DeviceParamKey'], value: number | null) => {
		if (value !== null) {
			void persistSetting(definition, value);
		}
	};

	const getBooleanSettingValue = (key: string): boolean => deviceSettings[key]?.value === true;

	const getNumericSettingValue = (key: string): number | null => {
		const candidate = deviceSettings[key]?.value;
		return typeof candidate === 'number' ? candidate : null;
	};

	const isSettingSaving = (key: string): boolean => deviceSettings[key]?.loading ?? false;

	$effect(() => {
		if (selectedDevice) {
			activeCategory = 'device';
			void loadAllCategories(selectedDevice);
		} else {
			deviceSettings = createEmptySettingsState();
			loadedCategories = new Set();
		}
	});
</script>

<div class="border-base-300 space-y-4 border-t pt-6">
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

		<div class="flex justify-center">
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
		</div>

		{#if !settingsError && (categoryLoading || !loadedCategories.has(activeCategory))}
			<div class="flex items-center justify-center py-12">
				<div class="text-center">
					<span class="loading loading-spinner loading-md text-primary"></span>
					<p class="mt-2 text-sm opacity-70">Loading settings...</p>
				</div>
			</div>
		{:else if !settingsError}
			<div class="space-y-4">
				{#each Object.values(deviceSettings).filter(s => s.definition.category === activeCategory) as deviceSetting (deviceSetting.definition.key)}
					{@const definition = deviceSetting.definition}
					{#if deviceSetting.type?.toLowerCase() === 'bool'}
						<ToggleSetting
							label={definition.label}
							description={definition.description}
							value={deviceSetting.value === true}
							loading={deviceSetting.loading}
							disabled={!selectedDevice}
							onChange={(value) => handleBooleanSettingChange(definition, value)}
						/>
					{:else}
						<SelectSetting
							label={definition.label}
							description={definition.description}
							options={[]}
							value={typeof deviceSetting.value === 'number' ? deviceSetting.value : null}
							loading={deviceSetting.loading}
							disabled={!selectedDevice}
							onChange={(value) => handleNumberSettingChange(definition, value)}
						/>
					{/if}
				{/each}
			</div>
		{/if}
	{/if}
</div>
