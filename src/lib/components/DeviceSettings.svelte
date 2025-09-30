<script lang="ts">
	import { sunnylinkClient } from '$lib/api/client';
	import { toast } from 'svelte-sonner';
	import { SETTINGS_DEFINITIONS, type SettingCategory, type SettingDefinition } from '$lib/settings-definitions';
	import ToggleSetting from '$lib/components/settings/ToggleSetting.svelte';
	import SelectSetting from '$lib/components/settings/SelectSetting.svelte';

	interface Props {
		selectedDevice: string;
	}

	let { selectedDevice }: Props = $props();

	interface DeviceSettingState {
		definition: SettingDefinition;
		value: boolean | number | null;
		encodedValue: string | null;
		loading: boolean;
	}

	let activeCategory = $state<SettingCategory>('device');
	let loadedCategories = $state(new Set<SettingCategory>());
	let categoryLoading = $state(false);
	let settingsLoading = $state(false);
	let settingsError = $state<string | null>(null);

	const categorySettings = $derived.by(() => {
		return SETTINGS_DEFINITIONS.filter((def) => def.category === activeCategory);
	});

	const createEmptySettingsState = (): Record<string, DeviceSettingState> => {
		const state: Record<string, DeviceSettingState> = {};
		for (const definition of SETTINGS_DEFINITIONS) {
			state[definition.key] = { definition, value: null, encodedValue: null, loading: false };
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

	const decodeSettingValue = (definition: SettingDefinition, encodedValue: string | null): boolean | number | null => {
		const decoded = decodeBase64Value(encodedValue);
		if (decoded === null) return null;

		if (definition.type === 'bool') {
			const normalized = decoded.toLowerCase();
			return normalized === '1' || normalized === 'true';
		}

		const parsed = Number.parseInt(decoded, 10);
		return Number.isNaN(parsed) ? null : parsed;
	};

	const encodeSettingValue = (definition: SettingDefinition, value: boolean | number): string => {
		return encodeBase64Value(definition.type === 'bool' ? (value ? '1' : '0') : value.toString());
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

		try {
			const requests = categories.map(category => {
				const keys = SETTINGS_DEFINITIONS.filter((def) => def.category === category).map((def) => def.key);
				return sunnylinkClient.GET('/settings/{deviceId}/values', {
					params: {
						path: { deviceId },
						query: { paramKeys: keys }
					}
				}).then(response => ({ category, response, keys }));
			});

			const results = await Promise.all(requests);

			if (selectedDevice !== requestDeviceId) return;

			for (const { category, response, keys } of results) {
				if (response.error) {
					console.error(`Failed to load ${category} settings:`, response.error);
					continue;
				}

				const settingsPayload = response.data?.settings ?? {};

				for (const key of keys) {
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
	};

	const persistSetting = async (definition: SettingDefinition, value: boolean | number) => {
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
	};

	const handleBooleanSettingChange = (definition: SettingDefinition, value: boolean) => {
		void persistSetting(definition, value);
	};

	const handleNumberSettingChange = (definition: SettingDefinition, value: number | null) => {
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

		{#if categoryLoading || !loadedCategories.has(activeCategory)}
			<div class="flex items-center justify-center py-12">
				<div class="text-center">
					<span class="loading loading-spinner loading-md text-primary"></span>
					<p class="mt-2 text-sm opacity-70">Loading settings...</p>
				</div>
			</div>
		{:else}
			<div class="space-y-4">
				{#each categorySettings as definition (definition.key)}
					{#if definition.type === 'bool'}
						<ToggleSetting
							label={definition.label}
							description={definition.description}
							value={getBooleanSettingValue(definition.key)}
							loading={isSettingSaving(definition.key)}
							disabled={!selectedDevice}
							onChange={(value) => handleBooleanSettingChange(definition, value)}
						/>
					{:else}
						<SelectSetting
							label={definition.label}
							description={definition.description}
							options={[]}
							value={getNumericSettingValue(definition.key)}
							loading={isSettingSaving(definition.key)}
							disabled={!selectedDevice}
							onChange={(value) => handleNumberSettingChange(definition, value)}
						/>
					{/if}
				{/each}
			</div>
		{/if}
	{/if}
</div>