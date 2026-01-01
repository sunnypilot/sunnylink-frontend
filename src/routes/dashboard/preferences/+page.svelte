<script lang="ts">
	import { preferences } from '$lib/stores/preferences.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import {
		SETTINGS_DEFINITIONS,
		type SettingDefinition,
		type SettingCategory
	} from '$lib/types/settings';
	import { Check, Copy, RefreshCw, Search } from 'lucide-svelte';
	import { browser } from '$app/environment';

	const isDev =
		import.meta.env.DEV || (browser && localStorage.getItem('debug_override') === 'true');

	// Load initial definitions from localStorage if available, otherwise use hardcoded defaults
	let initialDefinitions: SettingDefinition[] = SETTINGS_DEFINITIONS;
	if (browser) {
		const stored = localStorage.getItem('sunnylink_custom_definitions');
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				// Merge stored definitions with current hardcoded ones to ensure we have all keys
				// This prefers stored values for existing keys
				const storedMap = new Map(parsed.map((d: SettingDefinition) => [d.key, d]));
				initialDefinitions = SETTINGS_DEFINITIONS.map((def) => {
					const storedDef = storedMap.get(def.key);
					return storedDef ? (storedDef as SettingDefinition) : def;
				});

				// Also add any stored definitions that are not in hardcoded (e.g. from device)
				const hardcodedKeys = new Set(SETTINGS_DEFINITIONS.map((d) => d.key));
				for (const def of parsed) {
					if (!hardcodedKeys.has(def.key)) {
						initialDefinitions.push(def);
					}
				}
			} catch (e) {
				console.error('Failed to load custom definitions', e);
			}
		}
	}

	let definitions = $state<SettingDefinition[]>(JSON.parse(JSON.stringify(initialDefinitions)));
	let copied = $state(false);
	let searchQuery = $state('');
	let selectedCategory = $state<SettingCategory | 'all'>('all');

	// Persist changes to localStorage
	$effect(() => {
		if (browser) {
			localStorage.setItem('sunnylink_custom_definitions', JSON.stringify(definitions));
		}
	});

	// Integrate device settings
	$effect(() => {
		const deviceId = deviceState.selectedDeviceId;
		if (deviceId && deviceState.deviceSettings[deviceId]) {
			const deviceSettings = deviceState.deviceSettings[deviceId];
			const currentKeys = new Set(definitions.map((d) => d.key));

			let hasNew = false;
			for (const setting of deviceSettings) {
				if (setting.key && !currentKeys.has(setting.key)) {
					definitions.push({
						key: setting.key,
						label: setting.key,
						description: 'Unknown setting from device',
						category: 'other',
						advanced: false,
						readonly: false,
						hidden: false
					});
					currentKeys.add(setting.key);
					hasNew = true;
				}
			}
			if (hasNew) {
				// Trigger reactivity if needed, though push to state array should work
				definitions = [...definitions];
			}
		}
	});

	const categories: SettingCategory[] = [
		'device',
		'toggles',
		'steering',
		'cruise',
		'visuals',
		'developer',
		'other'
	];

	let filteredDefinitions = $derived(
		definitions.filter((def) => {
			const query = searchQuery.toLowerCase();
			const matchesSearch =
				def.key.toLowerCase().includes(query) ||
				def.label.toLowerCase().includes(query) ||
				def.description.toLowerCase().includes(query) ||
				def.category.toLowerCase().includes(query);

			const matchesCategory = selectedCategory === 'all' || def.category === selectedCategory;

			return matchesSearch && matchesCategory;
		})
	);

	function isChanged(def: SettingDefinition, field: keyof SettingDefinition): boolean {
		const original = SETTINGS_DEFINITIONS.find((d) => d.key === def.key);
		if (!original) return true; // New setting from device is considered "changed" from defaults
		return original[field] !== def[field];
	}

	function generateCode() {
		// Only export definitions that differ from defaults or are new?
		// Or export everything? The user likely wants to replace the file content.
		// We should probably export the full list, but maybe sorted nicely.

		const code = `export const SETTINGS_DEFINITIONS: SettingDefinition[] = ${JSON.stringify(definitions, null, 4)};`;

		let tsCode = 'export const SETTINGS_DEFINITIONS: SettingDefinition[] = [\n';

		// Group by category for readability
		const grouped = definitions.reduce(
			(acc, def) => {
				if (!acc[def.category]) acc[def.category] = [];
				acc[def.category]!.push(def);
				return acc;
			},
			{} as Record<string, SettingDefinition[]>
		);

		for (const cat of categories) {
			const catSettings = grouped[cat];
			if (catSettings) {
				tsCode += `    // ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
				for (const def of catSettings) {
					tsCode += `    { key: '${def.key}', label: '${def.label.replace(/'/g, "\\'")}', description: '${def.description.replace(/'/g, "\\'")}', category: '${def.category}'`;
					if (def.advanced) tsCode += `, advanced: true`;
					if (def.readonly) tsCode += `, readonly: true`;
					if (def.hidden) tsCode += `, hidden: true`;
					tsCode += ` },\n`;
				}
				tsCode += '\n';
			}
		}

		tsCode += '];';

		navigator.clipboard.writeText(tsCode);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	let resetModalOpen = $state(false);

	function resetDefinitions() {
		resetModalOpen = true;
	}

	function confirmReset() {
		definitions = JSON.parse(JSON.stringify(SETTINGS_DEFINITIONS));
		localStorage.removeItem('sunnylink_custom_definitions');
		resetModalOpen = false;
	}
</script>

<div class="space-y-8">
	<div>
		<h2 class="text-2xl font-bold text-white">User Preferences</h2>
		<p class="text-slate-400">Manage your local interface settings.</p>
	</div>

	<div class="grid gap-6 md:grid-cols-2">
		{#if isDev}
			<!-- Debug Mode -->
			<div class="rounded-xl border border-[#334155] bg-[#101a29] p-6">
				<div class="flex items-center justify-between">
					<div>
						<h3 class="font-medium text-white">Debug Mode</h3>
						<p class="text-sm text-slate-400">Show setting keys instead of labels.</p>
					</div>
					<button
						class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-[#0f1726] focus:outline-none"
						class:bg-primary={preferences.debugMode}
						class:bg-slate-700={!preferences.debugMode}
						onclick={() => (preferences.debugMode = !preferences.debugMode)}
						role="switch"
						aria-checked={preferences.debugMode}
						aria-label="Toggle Debug Mode"
					>
						<span
							class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
							class:translate-x-6={preferences.debugMode}
							class:translate-x-1={!preferences.debugMode}
						></span>
					</button>
				</div>
			</div>
		{/if}

		<!-- Show Advanced -->
		<div class="rounded-xl border border-[#334155] bg-[#101a29] p-6">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="font-medium text-white">Show Advanced Settings</h3>
					<p class="text-sm text-slate-400">Reveal settings marked as advanced.</p>
				</div>
				<button
					class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-[#0f1726] focus:outline-none"
					class:bg-primary={preferences.showAdvanced}
					class:bg-slate-700={!preferences.showAdvanced}
					onclick={() => (preferences.showAdvanced = !preferences.showAdvanced)}
					role="switch"
					aria-checked={preferences.showAdvanced}
					aria-label="Toggle Show Advanced Settings"
				>
					<span
						class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
						class:translate-x-6={preferences.showAdvanced}
						class:translate-x-1={!preferences.showAdvanced}
					></span>
				</button>
			</div>
		</div>

		<!-- Show Device Online Help -->
		<div class="rounded-xl border border-[#334155] bg-[#101a29] p-6">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="font-medium text-white">Show Device Online Help</h3>
					<p class="text-sm text-slate-400">
						Display the explanation modal when visiting settings.
					</p>
				</div>
				<button
					class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-[#0f1726] focus:outline-none"
					class:bg-primary={preferences.showDeviceOnlineHelp}
					class:bg-slate-700={!preferences.showDeviceOnlineHelp}
					onclick={() => (preferences.showDeviceOnlineHelp = !preferences.showDeviceOnlineHelp)}
					role="switch"
					aria-checked={preferences.showDeviceOnlineHelp}
					aria-label="Toggle Show Device Online Help"
				>
					<span
						class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
						class:translate-x-6={preferences.showDeviceOnlineHelp}
						class:translate-x-1={!preferences.showDeviceOnlineHelp}
					></span>
				</button>
			</div>
		</div>
	</div>

	{#if isDev}
		<div class="divider before:bg-[#1e293b] after:bg-[#1e293b]"></div>

		<div>
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 class="text-2xl font-bold text-white">Settings Metadata Editor</h2>
					<p class="text-slate-400">Customize setting definitions and generate code.</p>
				</div>
				<div class="flex gap-2">
					<button class="btn text-slate-400 btn-ghost hover:text-white" onclick={resetDefinitions}>
						<RefreshCw size={18} />
						Reset
					</button>
					<button class="btn btn-primary" onclick={generateCode}>
						{#if copied}
							<Check size={18} />
							Copied!
						{:else}
							<Copy size={18} />
							Copy Code
						{/if}
					</button>
				</div>
			</div>

			<!-- Search and Filter -->
			<div class="mt-6 flex gap-4">
				<div class="relative flex-1">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
						<Search class="h-5 w-5 text-slate-400" />
					</div>
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search settings by key, label, or category..."
						class="input-bordered input w-full bg-[#101a29] pl-10 text-white placeholder-slate-500 focus:border-primary focus:outline-none"
					/>
				</div>
				<select
					bind:value={selectedCategory}
					class="select-bordered select bg-[#101a29] text-white focus:border-primary focus:outline-none"
				>
					<option value="all">All Categories</option>
					{#each categories as cat}
						<option value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
					{/each}
				</select>
			</div>

			<div class="mt-6 overflow-hidden rounded-xl border border-[#334155] bg-[#101a29]">
				<div class="overflow-x-auto">
					<table class="table w-full">
						<thead>
							<tr class="border-b border-[#334155] text-slate-400">
								<th class="bg-[#1e293b]">Key</th>
								<th class="bg-[#1e293b]">Label</th>
								<th class="bg-[#1e293b]">Description</th>
								<th class="bg-[#1e293b]">Category</th>
								<th class="bg-[#1e293b] text-center">Adv</th>
								<th class="bg-[#1e293b] text-center">RO</th>
								<th class="bg-[#1e293b] text-center">Hide</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredDefinitions as def (def.key)}
								<tr class="border-b border-[#334155]/50 hover:bg-[#1e293b]/50">
									<td class="font-mono text-xs text-slate-300">{def.key}</td>
									<td>
										<input
											type="text"
											bind:value={def.label}
											class="input input-sm w-full max-w-xs input-ghost text-white focus:bg-[#1e293b]"
											class:text-orange-400={isChanged(def, 'label')}
										/>
									</td>
									<td>
										<input
											type="text"
											bind:value={def.description}
											class="input input-sm w-full max-w-xs input-ghost text-white focus:bg-[#1e293b]"
											class:text-orange-400={isChanged(def, 'description')}
										/>
									</td>
									<td>
										<select
											bind:value={def.category}
											class="select-bordered select w-full max-w-xs bg-[#1e293b] select-sm text-white focus:border-primary focus:outline-none"
											class:text-orange-400={isChanged(def, 'category')}
										>
											{#each categories as cat}
												<option value={cat} class="bg-[#1e293b] text-white">{cat}</option>
											{/each}
										</select>
									</td>
									<td class="text-center">
										<input
											type="checkbox"
											bind:checked={def.advanced}
											class="checkbox checkbox-sm checkbox-primary"
											class:checkbox-warning={isChanged(def, 'advanced')}
										/>
									</td>
									<td class="text-center">
										<input
											type="checkbox"
											bind:checked={def.readonly}
											class="checkbox checkbox-sm checkbox-warning"
											class:checkbox-error={isChanged(def, 'readonly')}
										/>
									</td>
									<td class="text-center">
										<input
											type="checkbox"
											bind:checked={def.hidden}
											class="checkbox checkbox-sm checkbox-error"
											class:checkbox-primary={isChanged(def, 'hidden')}
										/>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Reset Confirmation Modal -->
{#if resetModalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
		<div class="w-full max-w-md rounded-xl border border-[#334155] bg-[#1e293b] p-6 shadow-2xl">
			<h3 class="text-lg font-bold text-white">Reset Definitions?</h3>
			<p class="mt-2 text-slate-400">
				Are you sure you want to reset all definitions to defaults? This will clear your local
				customizations.
			</p>
			<div class="mt-6 flex justify-end gap-3">
				<button
					class="btn text-slate-400 btn-ghost hover:text-white"
					onclick={() => (resetModalOpen = false)}
				>
					Cancel
				</button>
				<button class="btn text-white btn-error" onclick={confirmReset}> Reset Everything </button>
			</div>
		</div>
	</div>
{/if}
