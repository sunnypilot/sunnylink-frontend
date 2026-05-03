<script lang="ts">
	import { fly } from 'svelte/transition';
	import SyncStatusIndicator from '$lib/components/SyncStatusIndicator.svelte';
	import DeviceSelector from '$lib/components/DeviceSelector.svelte';
	import SettingsActionBar from '$lib/components/SettingsActionBar.svelte';
	import PushSettingsModal from '$lib/components/PushSettingsModal.svelte';
	import SchemaPanel from '$lib/components/schema/SchemaPanel.svelte';
	import SchemaItemRenderer from '$lib/components/schema/SchemaItemRenderer.svelte';
	import { createSettingsCategoryController } from './controller.svelte';

	let { data } = $props();

	const settingsController = createSettingsCategoryController();
	const controllerState = settingsController.state;
	const sync = settingsController.sync;

	let activeSubPanel = $derived(settingsController.activeSubPanel);
	let category = $derived(settingsController.category);
	let categorySettings = $derived(settingsController.categorySettings);
	let currentDeviceAlias = $derived(settingsController.currentDeviceAlias);
	let deviceId = $derived(settingsController.deviceId);
	let hasChanges = $derived(settingsController.hasChanges);
	let isDeviceOfflineOrError = $derived(settingsController.isDeviceOfflineOrError);
	let readonlyGroups = $derived(settingsController.readonlyGroups);
	let readonlySettings = $derived(settingsController.readonlySettings);
	let schemaPanel = $derived(settingsController.schemaPanel);
	let settings = $derived(settingsController.settings);
	let useSchema = $derived(settingsController.useSchema);
	let writableGroups = $derived(settingsController.writableGroups);
	let writableSettings = $derived(settingsController.writableSettings);
</script>

<div class="space-y-9" class:pb-16={hasChanges && !useSchema}>
	<div class="mx-auto w-full max-w-2xl xl:max-w-3xl" style="display: grid;">
		{#key activeSubPanel?.id ?? '__root__'}
			<div
				style="grid-area: 1 / 1;"
				in:fly={{
					x: controllerState.subPanelDirection === 'forward' ? 60 : -60,
					duration: 200,
					delay: 120
				}}
				out:fly={{ x: controllerState.subPanelDirection === 'forward' ? -30 : 30, duration: 120 }}
			>
				{#if activeSubPanel}
					<div class="px-4">
						<button
							class="row-press mb-1 flex items-center gap-1 rounded px-1 py-0.5 text-[0.8125rem] text-[var(--sl-text-3)] transition-colors hover:text-[var(--sl-text-1)]"
							onclick={settingsController.closeSubPanel}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
							>
							{schemaPanel?.label ?? category}
						</button>
						<h2
							class="flex items-baseline gap-3 text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)]"
						>
							<span>{activeSubPanel.label}</span>
							{#if controllerState.loadingValues}
								<span
									class="loading loading-xs loading-spinner text-primary"
									style="align-self: center;"
								></span>
							{:else}
								<SyncStatusIndicator
									status={sync.status}
									onRefresh={settingsController.handleManualRefresh}
								/>
							{/if}
						</h2>
					</div>
				{:else}
					<div class="px-4">
						<h2
							class="flex items-baseline gap-3 text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)] capitalize"
						>
							<span>{schemaPanel?.label ?? category}</span>
							{#if controllerState.loadingValues}
								<span
									class="loading loading-xs loading-spinner text-primary"
									style="align-self: center;"
								></span>
							{:else}
								<SyncStatusIndicator
									status={sync.status}
									onRefresh={settingsController.handleManualRefresh}
								/>
							{/if}
						</h2>
						{#if schemaPanel?.description}
							<p class="mt-2 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
								{schemaPanel.description}
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{/key}
	</div>

	{#if !deviceId}
		{#await data.streamed.deviceResult then result}
			{@const streamedDevices = result.devices ?? []}
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="mb-4 rounded-full bg-[var(--sl-border)] p-4">
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
							d="M12 6v6m0 0v6m0-6h6m-6 0H6"
						/>
					</svg>
				</div>
				<h3 class="text-xl font-semibold text-[var(--sl-text-1)]">No Device Selected</h3>
				<p class="mt-2 max-w-md text-[var(--sl-text-2)]">
					Please select a device to configure its settings.
				</p>
				<div class="mt-6">
					{#if streamedDevices.length > 0}
						<DeviceSelector devices={streamedDevices} />
					{/if}
				</div>
			</div>
		{/await}
	{:else if !useSchema && !isDeviceOfflineOrError && !settings && !categorySettings.length}
		<!-- Waiting for device connection + schema/legacy settings to load.
		     Show a non-blocking connecting state instead of an infinite spinner. -->
		<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
			<div
				class="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-12 text-center"
			>
				<span class="loading loading-md loading-spinner text-primary"></span>
				<p class="text-[0.8125rem] font-[450] text-[var(--sl-text-3)]">Connecting to device...</p>
			</div>
		</div>
	{:else if useSchema && schemaPanel}
		<!-- ═══ Schema-driven rendering (centered narrow column, grouped cards) ═══ -->
		<div class="mx-auto w-full max-w-2xl xl:max-w-3xl" style="display: grid;">
			{#key activeSubPanel?.id ?? '__root__'}
				<div
					style="grid-area: 1 / 1;"
					in:fly={{
						x: controllerState.subPanelDirection === 'forward' ? 60 : -60,
						duration: 200,
						delay: 120
					}}
					out:fly={{
						x: controllerState.subPanelDirection === 'forward' ? -30 : 30,
						duration: 120
					}}
				>
					{#if activeSubPanel}
						<div
							class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
						>
							{#each activeSubPanel.items as item, itemIndex (item.key)}
								<SchemaItemRenderer
									{deviceId}
									{item}
									loadingValues={controllerState.loadingValues}
									isLast={itemIndex === activeSubPanel.items.length - 1}
								/>
							{/each}
						</div>
					{:else}
						<SchemaPanel
							{deviceId}
							panel={schemaPanel}
							loadingValues={controllerState.loadingValues}
							onSubPanelOpen={settingsController.openSubPanel}
						/>
					{/if}
				</div>
			{/key}
		</div>
	{:else if useSchema && !schemaPanel}
		<!-- Schema loaded but no panel for this category — render with unified style -->
		{#if writableSettings.length > 0}
			<div class="mx-auto w-full max-w-2xl space-y-6 xl:max-w-3xl">
				{#each writableGroups as group (group.label ?? '__default__')}
					{#if group.label}
						<div class="px-4">
							<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">{group.label}</p>
						</div>
					{/if}
					<div
						class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
					>
						{#each group.settings as setting, settingIndex (setting.key)}
							<SchemaItemRenderer
								{deviceId}
								item={settingsController.getSchemaItem(setting)}
								loadingValues={controllerState.loadingValues}
								isLast={settingIndex === group.settings.length - 1}
							/>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	{:else if categorySettings.length === 0}
		<div class="alert border-none bg-[var(--sl-bg-elevated)] text-[var(--sl-text-2)]">
			<span>No settings found for this category.</span>
		</div>
	{:else}
		<!-- ═══ Legacy rendering (no schema available) — unified style ═══ -->
		{#if writableSettings.length > 0}
			<div class="mx-auto w-full max-w-2xl space-y-6 xl:max-w-3xl">
				{#each writableGroups as group (group.label ?? '__default__')}
					{#if group.label}
						<div class="px-4">
							<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">{group.label}</p>
						</div>
					{/if}
					<div
						class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
					>
						{#each group.settings as setting, settingIndex (setting.key)}
							<SchemaItemRenderer
								{deviceId}
								item={settingsController.getSchemaItem(setting)}
								loadingValues={controllerState.loadingValues}
								isLast={settingIndex === group.settings.length - 1}
							/>
						{/each}
					</div>
				{/each}
			</div>
		{/if}

		{#if readonlySettings.length > 0}
			<div class="mx-auto w-full max-w-2xl xl:max-w-3xl">
				<details
					class="group mt-8 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] open:bg-[var(--sl-bg-input)]"
				>
					<summary
						class="flex cursor-pointer items-center justify-between p-4 font-medium text-[var(--sl-text-2)] hover:text-[var(--sl-text-1)]"
					>
						<span>Read-Only Settings ({readonlySettings.length})</span>
						<span class="transition-transform group-open:rotate-180">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg
							>
						</span>
					</summary>
					<div class="border-t border-[var(--sl-border)] p-4">
						{#each readonlyGroups as group (group.label ?? '__ro_default__')}
							{#if group.label}
								<div class="mt-4 mb-2 first:mt-0">
									<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">{group.label}</p>
								</div>
							{/if}
							<div
								class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
							>
								{#each group.settings as setting, settingIndex (setting.key)}
									<SchemaItemRenderer
										{deviceId}
										item={settingsController.getSchemaItem(setting)}
										loadingValues={controllerState.loadingValues}
										isLast={settingIndex === group.settings.length - 1}
										readonly={true}
									/>
								{/each}
							</div>
						{/each}
					</div>
				</details>
			</div>
		{/if}
	{/if}
</div>

<!-- Action bar + push modal only for legacy (non-schema) rendering -->
{#if !useSchema}
	<SettingsActionBar
		onPush={settingsController.openPushModal}
		onReset={settingsController.resetCurrentDeviceChanges}
	/>

	<PushSettingsModal
		bind:open={controllerState.pushModalOpen}
		onPushSuccess={settingsController.handlePushSuccess}
		alias={currentDeviceAlias}
	/>
{/if}
