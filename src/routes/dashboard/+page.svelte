<script lang="ts">
	import UpdateAliasModal from '$lib/components/UpdateAliasModal.svelte';
	import DeregisterDeviceModal from '$lib/components/DeregisterDeviceModal.svelte';
	import DashboardSkeleton from './DashboardSkeleton.svelte';
	import DeviceRowMenu from '$lib/components/DeviceRowMenu.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import { Save, Plus, Loader2, ChevronDown, ChevronRight, Check, Mouse } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import BackupProgressModal from '$lib/components/BackupProgressModal.svelte';
	import { createDashboardController } from './controller.svelte';

	const dashboardController = createDashboardController();
	const authState = dashboardController.authState;
	const deviceState = dashboardController.deviceState;
	const controllerState = dashboardController.state;

	let devices = $derived(dashboardController.devices);
	let nudgeVisible = $derived(dashboardController.nudgeVisible);
	let offlineDevices = $derived(dashboardController.offlineDevices);
	let onlineDevices = $derived(dashboardController.onlineDevices);
	let pendingChanges = $derived(dashboardController.pendingChanges);
</script>

{#if devices.length === 0 && !deviceState.pairedDevicesLoaded}
	<!-- Cold start: no cached devices, API hasn't returned yet — show skeleton -->
	<DashboardSkeleton name={authState.profile?.name ?? undefined} />
{:else}
	<div class="mx-auto w-full max-w-2xl pb-24 xl:max-w-3xl">
		{#if devices.length === 0}
			<!-- API returned but no devices — true empty state -->
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<p class="text-sm text-[var(--sl-text-2)]">No devices connected</p>
				<p class="mt-1 text-xs text-[var(--sl-text-3)]">Pair a sunnypilot device to get started.</p>
				<button
					class="btn mt-6 gap-2 border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-1)] btn-sm hover:bg-[var(--sl-bg-subtle)]"
					onclick={() => dashboardController.openPairingModal()}
				>
					<Plus size={16} />
					Pair Device
				</button>
			</div>
		{:else}
			<div class="mb-6 px-4">
				<h1
					class="text-[24px] leading-[32px] font-medium tracking-[-0.16px] text-[var(--sl-text-1)]"
				>
					Dashboard
				</h1>
				<p class="mt-1 text-[0.8125rem] text-[var(--sl-text-2)]">
					{devices.length} device{devices.length === 1 ? '' : 's'}
				</p>
			</div>

			{#if nudgeVisible}
				<div class="mb-4 px-4" transition:slide={{ duration: 150 }}>
					<div
						class="flex items-center gap-3 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-3"
					>
						<Mouse size={16} class="shrink-0 text-[var(--sl-text-3)]" />
						<p class="flex-1 text-[0.8125rem] text-[var(--sl-text-2)]">
							Click a device card to view and manage its settings
						</p>
						<button
							class="btn text-[var(--sl-text-3)] btn-ghost btn-xs"
							onclick={() => dashboardController.dismissNudge()}>Dismiss</button
						>
						<label class="flex items-center gap-1.5">
							<input
								type="checkbox"
								class="checkbox border-slate-500 checkbox-xs checkbox-primary"
								onchange={() => dashboardController.disableDashboardNudge()}
							/>
							<span class="text-xs text-[var(--sl-text-3)]">Don't show again</span>
						</label>
					</div>
				</div>
			{/if}

			<div class="mb-3 flex items-center justify-between px-4">
				<h2 class="text-xs font-semibold tracking-[0.2em] text-[var(--sl-text-3)] uppercase">
					Devices
				</h2>
				<RefreshIndicator />
			</div>

			<div class="flex flex-col gap-3" role="list" aria-label="Device list">
				{#each onlineDevices as device (device.device_id)}
					{@const isLoading = dashboardController.isDeviceLoading(device)}
					{@const isUnregistered = dashboardController.isUnregisteredDevice(device)}
					{@const isRenaming = controllerState.renamingDeviceId === device.device_id}
					{@const isSelected = dashboardController.isSelectedDevice(device)}

					<div
						class="group rounded-xl border border-y border-r border-l-[3px] transition-all duration-150 hover:border-y-[var(--sl-text-3)]/30 hover:border-r-[var(--sl-text-3)]/30 hover:bg-[var(--sl-bg-elevated)]/30 hover:shadow-sm {dashboardController.getStripColor(
							device
						)} {isSelected
							? 'border-y-[var(--sl-border)] border-r-[var(--sl-border)] bg-primary/[0.04] dark:bg-primary/[0.08]'
							: 'border-y-[var(--sl-border)] border-r-[var(--sl-border)] bg-[var(--sl-bg-surface)]'}"
						onclick={() => dashboardController.handleDeviceClick(device)}
						onkeydown={(keyboardEvent) => {
							if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
								keyboardEvent.preventDefault();
								dashboardController.handleDeviceClick(device);
							}
						}}
						role="listitem"
						tabindex="0"
						aria-label="{dashboardController.getAlias(device)} - {dashboardController.getStatusText(device)}"
					>
						<div class="flex items-start gap-3 px-4 py-4">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									{#if isRenaming}
										<input
											id="alias-{device.device_id}"
											type="text"
											value={dashboardController.getAlias(device)}
											oninput={(inputEvent) =>
												dashboardController.handleAliasChange(device, inputEvent.currentTarget.value)}
											onblur={() => dashboardController.stopRename()}
											onkeydown={(keyboardEvent) =>
												dashboardController.handleRenameKeydown(keyboardEvent)}
											onclick={(mouseEvent) => mouseEvent.stopPropagation()}
											class="min-w-0 flex-1 rounded border border-primary/50 bg-[var(--sl-bg-input)] px-2 py-0.5 text-sm font-medium text-[var(--sl-text-1)] focus:border-primary focus:outline-none"
										/>
									{:else}
										<span class="truncate text-sm font-medium text-[var(--sl-text-1)]">
											{dashboardController.getAlias(device)}
										</span>
									{/if}
									{#if isSelected}
										<span
											class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-white"
										>
											<Check size={10} strokeWidth={3} />
										</span>
									{/if}
									{#if isLoading}
										<Loader2 size={12} class="shrink-0 animate-spin text-[var(--sl-text-3)]" />
									{/if}
								</div>

								<div class="mt-3 max-w-[280px] space-y-1.5">
									{#if dashboardController.getDeviceTypeName(device)}
										<div class="flex items-center gap-3">
											<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
												>Device</span
											>
											<span class="text-[0.75rem] text-[var(--sl-text-2)]"
												>{dashboardController.getDeviceTypeName(device)}</span
											>
										</div>
									{/if}
									<div class="flex items-center gap-3">
										<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]">Status</span>
										<span class="text-[0.75rem] text-[var(--sl-text-2)]"
											>{dashboardController.getDrivingState(device) ??
												dashboardController.getStatusText(device)}</span
										>
									</div>
									{#if dashboardController.getVersion(device)}
										<div class="flex items-center gap-3">
											<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
												>Version</span
											>
											<span class="text-[0.75rem] text-[var(--sl-text-2)]"
												>{dashboardController.getVersion(device)}</span
											>
										</div>
									{/if}
									{#if dashboardController.getBranch(device)}
										<div class="flex items-center gap-3">
											<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
												>Branch</span
											>
											<span class="truncate font-mono text-[0.75rem] text-[var(--sl-text-2)]"
												>{dashboardController.getBranch(device)}</span
											>
										</div>
									{/if}
									{#if dashboardController.getCommit(device)}
										<div class="flex items-center gap-3">
											<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
												>Commit</span
											>
											<span class="font-mono text-[0.75rem] text-[var(--sl-text-2)]"
												>{dashboardController.getCommit(device)}</span
											>
										</div>
									{/if}
									{#if dashboardController.getNetworkType(device)}
										<div class="flex items-center gap-3">
											<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
												>Network</span
											>
											<span class="text-[0.75rem] text-[var(--sl-text-2)]"
												>{dashboardController.getNetworkType(device)}</span
											>
										</div>
									{/if}
									{#if dashboardController.getLastSeenText(device)}
										<div class="flex items-center gap-3">
											<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
												>Last seen</span
											>
											{#key dashboardController.statusPolling.tickCounter}
												<span class="text-[0.75rem] text-[var(--sl-text-2)]"
													>{dashboardController.getLastSeenText(device)}</span
												>
											{/key}
										</div>
									{/if}
								</div>
							</div>

							<div
								class="shrink-0 pt-0.5"
								onclick={(mouseEvent) => mouseEvent.stopPropagation()}
								onkeydown={(keyboardEvent) => keyboardEvent.stopPropagation()}
							>
								<DeviceRowMenu
									deviceId={device.device_id}
									dongleId={isUnregistered ? undefined : device.comma_dongle_id}
									pairedAt={device.created_at}
									isDownloading={deviceState.backupState.isDownloading &&
										deviceState.backupState.deviceId === device.device_id}
									onRename={() => dashboardController.startRename(device.device_id)}
									onDownloadBackup={() =>
										dashboardController.handleDownloadBackup(device.device_id)}
									onDeregister={() => dashboardController.openDeregisterModal(device)}
								/>
							</div>
						</div>
					</div>
				{/each}

				{#if offlineDevices.length > 0}
					<button
						class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--sl-bg-elevated)]/30"
						onclick={() => dashboardController.toggleOfflineSection()}
						aria-expanded={controllerState.offlineSectionOpen}
					>
						<span class="text-xs text-[var(--sl-text-3)]">
							Offline · {offlineDevices.length} device{offlineDevices.length === 1 ? '' : 's'}
						</span>
						{#if controllerState.offlineSectionOpen}
							<ChevronDown size={14} class="text-[var(--sl-text-3)]" />
						{:else}
							<ChevronRight size={14} class="text-[var(--sl-text-3)]" />
						{/if}
					</button>

					{#if controllerState.offlineSectionOpen}
						<div class="flex flex-col gap-3" transition:slide={{ duration: 150 }}>
							{#each offlineDevices as device (device.device_id)}
								{@const isUnregistered = dashboardController.isUnregisteredDevice(device)}
								{@const isRenaming = controllerState.renamingDeviceId === device.device_id}
								{@const isSelected = dashboardController.isSelectedDevice(device)}

								<div
									class="group rounded-xl border border-y border-r border-l-[3px] border-l-[var(--sl-text-3)]/20 transition-all duration-150 hover:border-y-[var(--sl-text-3)]/30 hover:border-r-[var(--sl-text-3)]/30 hover:bg-[var(--sl-bg-elevated)]/30 hover:shadow-sm {isSelected
										? 'border-y-[var(--sl-border)] border-r-[var(--sl-border)] bg-primary/[0.04] dark:bg-primary/[0.08]'
										: 'border-y-[var(--sl-border)] border-r-[var(--sl-border)] bg-[var(--sl-bg-surface)]'}"
									onclick={() => dashboardController.handleDeviceClick(device)}
									onkeydown={(keyboardEvent) => {
										if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
											keyboardEvent.preventDefault();
											dashboardController.handleDeviceClick(device);
										}
									}}
									role="listitem"
									tabindex="0"
									aria-label="{dashboardController.getAlias(device)} - Offline"
								>
									<div class="flex items-start gap-3 px-4 py-4">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2">
												{#if isRenaming}
													<input
														id="alias-{device.device_id}"
														type="text"
														value={dashboardController.getAlias(device)}
														oninput={(inputEvent) =>
															dashboardController.handleAliasChange(
																device,
																inputEvent.currentTarget.value
															)}
														onblur={() => dashboardController.stopRename()}
														onkeydown={(keyboardEvent) =>
															dashboardController.handleRenameKeydown(keyboardEvent)}
														onclick={(mouseEvent) => mouseEvent.stopPropagation()}
														class="min-w-0 flex-1 rounded border border-primary/50 bg-[var(--sl-bg-input)] px-2 py-0.5 text-sm font-medium text-[var(--sl-text-1)] focus:border-primary focus:outline-none"
													/>
												{:else}
													<span class="truncate text-sm font-medium text-[var(--sl-text-1)]">
														{dashboardController.getAlias(device)}
													</span>
												{/if}
												{#if isSelected}
													<span
														class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-white"
													>
														<Check size={10} strokeWidth={3} />
													</span>
												{/if}
											</div>

											<div class="mt-3 max-w-[280px] space-y-1.5">
												{#if dashboardController.getDeviceTypeName(device)}
													<div class="flex items-center gap-3">
														<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
															>Device</span
														>
														<span class="text-[0.75rem] text-[var(--sl-text-2)]"
															>{dashboardController.getDeviceTypeName(device)}</span
														>
													</div>
												{/if}
												<div class="flex items-center gap-3">
													<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
														>Status</span
													>
													<span class="text-[0.75rem] text-[var(--sl-text-2)]">Offline</span>
												</div>
												{#if dashboardController.getBranch(device)}
													<div class="flex items-center gap-3">
														<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
															>Branch</span
														>
														<span class="truncate font-mono text-[0.75rem] text-[var(--sl-text-2)]"
															>{dashboardController.getBranch(device)}</span
														>
													</div>
												{/if}
												{#if dashboardController.getCommit(device)}
													<div class="flex items-center gap-3">
														<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
															>Commit</span
														>
														<span class="font-mono text-[0.75rem] text-[var(--sl-text-2)]"
															>{dashboardController.getCommit(device)}</span
														>
													</div>
												{/if}
												{#if dashboardController.getLastSeenText(device)}
													<div class="flex items-center gap-3">
														<span class="w-16 shrink-0 text-[0.75rem] text-[var(--sl-text-3)]"
															>Last seen</span
														>
														{#key dashboardController.statusPolling.tickCounter}
															<span class="text-[0.75rem] text-[var(--sl-text-2)]"
																>{dashboardController.getLastSeenText(device)}</span
															>
														{/key}
													</div>
												{/if}
											</div>
										</div>

										<div
											class="shrink-0 pt-0.5"
											onclick={(mouseEvent) => mouseEvent.stopPropagation()}
											onkeydown={(keyboardEvent) => keyboardEvent.stopPropagation()}
										>
											<DeviceRowMenu
												deviceId={device.device_id}
												dongleId={isUnregistered ? undefined : device.comma_dongle_id}
												pairedAt={device.created_at}
												onRename={() => dashboardController.startRename(device.device_id)}
												onDeregister={() => dashboardController.openDeregisterModal(device)}
											/>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<button
				class="group mt-4 flex w-full items-center gap-4 rounded-xl border border-dashed border-[var(--sl-border)] px-4 py-3.5 text-left transition-colors hover:border-[var(--sl-text-3)]/50 hover:bg-[var(--sl-bg-surface)]/50"
				onclick={() => dashboardController.openPairingModal()}
			>
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--sl-text-3)]/50 text-[var(--sl-text-3)] transition-colors group-hover:border-[var(--sl-text-2)] group-hover:text-[var(--sl-text-2)]"
				>
					<Plus size={16} />
				</div>
				<p
					class="text-sm text-[var(--sl-text-3)] transition-colors group-hover:text-[var(--sl-text-2)]"
				>
					Pair New Device
				</p>
			</button>
		{/if}

		{#if pendingChanges.length > 0}
			<div
				class="animate-in slide-in-from-bottom-4 fade-in fixed bottom-6 left-1/2 z-40 w-full max-w-xl -translate-x-1/2 px-4 duration-300"
			>
				<div
					class="flex items-center justify-between gap-4 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]/95 p-4 shadow-2xl backdrop-blur-md"
				>
					<div class="flex items-center gap-3">
						<Save size={18} class="text-primary" />
						<div>
							<p class="text-sm font-medium text-[var(--sl-text-1)]">Unsaved Changes</p>
							<p class="text-xs text-[var(--sl-text-3)]">
								{pendingChanges.length} alias{pendingChanges.length === 1 ? '' : 'es'} modified
							</p>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<button
							class="btn text-[var(--sl-text-3)] btn-ghost btn-sm hover:text-[var(--sl-text-1)]"
							onclick={() => dashboardController.discardAliasChanges()}
						>
							Discard
						</button>
						<button
							class="btn btn-sm btn-primary"
							onclick={() => dashboardController.openAliasSaveModal()}
						>
							Save
						</button>
					</div>
				</div>
			</div>

			<UpdateAliasModal bind:open={controllerState.updateAliasModalOpen} changes={pendingChanges} />
		{/if}

		{#if controllerState.deviceToDeregister}
			<DeregisterDeviceModal
				bind:open={controllerState.deregisterModalOpen}
				deviceId={controllerState.deviceToDeregister}
				alias={controllerState.deviceToDeregisterAlias}
				pairedAt={controllerState.deviceToDeregisterPairedAt}
				isOnline={controllerState.deviceToDeregisterIsOnline}
				onDeregistered={dashboardController.handleDeregistered}
			/>
		{/if}
	</div>
{/if}

<BackupProgressModal
	onRetry={dashboardController.handleRetryFailedBackup}
	onFullBackup={dashboardController.handleFullBackupFromCurrentState}
/>
