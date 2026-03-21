<script lang="ts">
	import { preferences } from '$lib/stores/preferences.svelte';
	import { themeState, type ThemePreference } from '$lib/stores/theme.svelte';
	import { schemaState } from '$lib/stores/schema.svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { pendingChanges } from '$lib/stores/pendingChanges.svelte';
	import { toastState } from '$lib/stores/toast.svelte';
	import { browser } from '$app/environment';
	import { Sun, Moon, Monitor } from 'lucide-svelte';

	const isDev =
		import.meta.env.DEV || (browser && localStorage.getItem('debug_override') === 'true');

	const themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
		{ value: 'light', label: 'Light', icon: Sun },
		{ value: 'dark', label: 'Dark', icon: Moon },
		{ value: 'auto', label: 'System', icon: Monitor }
	];

	const landingPageOptions: { value: string; label: string }[] = [
		{ value: 'overview', label: 'Overview' },
		{ value: 'steering', label: 'Steering' },
		{ value: 'device', label: 'Device' },
		{ value: 'last_visited', label: 'Last Visited' }
	];

	function clearSchemaCache() {
		const deviceId = deviceState.selectedDeviceId;
		if (deviceId) {
			schemaState.clearCache(deviceId);
			toastState.show('Schema cache cleared. Will re-fetch on next page load.', 'success');
		} else {
			toastState.show('No device selected.', 'error');
		}
	}

	function clearPendingChanges() {
		const deviceId = deviceState.selectedDeviceId;
		if (deviceId) {
			pendingChanges.clearAll(deviceId);
			toastState.show('Pending changes cleared.', 'success');
		} else {
			toastState.show('No device selected.', 'error');
		}
	}

	function clearAllLocalData() {
		if (browser) {
			const keysToRemove: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key?.startsWith('sunnylink_schema_') || key?.startsWith('sunnylink_pending_') || key?.startsWith('sunnylink_values_')) {
					keysToRemove.push(key);
				}
			}
			for (const key of keysToRemove) {
				localStorage.removeItem(key);
			}
			toastState.show(`Cleared ${keysToRemove.length} cached entries.`, 'success');
		}
	}
</script>

<div class="mx-auto w-full max-w-2xl xl:max-w-3xl space-y-6">
	<!-- Page Header -->
	<div class="px-4">
		<h2 class="text-[24px] font-medium leading-[32px] tracking-[-0.16px] text-[var(--sl-text-1)]">
			Preferences
		</h2>
		<p class="mt-1 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">
			Manage your local interface settings. These preferences are stored in your browser.
		</p>
	</div>

	<!-- ═══ Appearance ═══ -->
	<div class="px-4">
		<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Appearance</p>
		<p class="mt-0.5 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">Theme and visual preferences</p>
	</div>
	<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
		<!-- Theme -->
		<div class="flex items-center justify-between px-4 py-3.5">
			<div>
				<p class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">Theme</p>
				<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Choose your preferred color scheme</p>
			</div>
			<div class="flex rounded-lg bg-[var(--sl-bg-page)] p-1">
				{#each themeOptions as opt}
					{@const isActive = themeState.preference === opt.value}
					<button
						type="button"
						class="flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-all duration-200"
						class:bg-[var(--sl-bg-surface)]={isActive}
						class:border={isActive}
						class:border-[var(--sl-border)]={isActive}
						class:shadow-sm={isActive}
						class:text-[var(--sl-text-1)]={isActive}
						class:font-medium={isActive}
						class:text-[var(--sl-text-3)]={!isActive}
						class:hover:text-[var(--sl-text-2)]={!isActive}
						onclick={() => themeState.setPreference(opt.value)}
					>
						<opt.icon size={13} />
						<span>{opt.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- ═══ Display ═══ -->
	<div class="px-4">
		<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Display</p>
		<p class="mt-0.5 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">Page behavior and information display</p>
	</div>
	<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
		<!-- Default Landing Page -->
		<div class="flex items-center justify-between px-4 py-3.5">
			<div>
				<p class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">Default Landing Page</p>
				<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Page shown when you open sunnylink</p>
			</div>
			<select
				class="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-input)] px-3 py-1.5 text-[0.8125rem] text-[var(--sl-text-1)] focus:border-primary focus:outline-none"
				bind:value={preferences.defaultLandingPage}
			>
				{#each landingPageOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>

		<!-- Show Device Online Help -->
		<div class="flex items-center justify-between px-4 py-3.5">
			<div>
				<button class="text-[0.8125rem] font-medium text-[var(--sl-text-1)] text-left" onclick={() => (preferences.showDeviceOnlineHelp = !preferences.showDeviceOnlineHelp)}>Device Connection Help</button>
				<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Show the explanation modal when visiting settings</p>
			</div>
			<button
				class="relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
				class:bg-primary={preferences.showDeviceOnlineHelp}
				class:bg-[var(--sl-toggle-off)]={!preferences.showDeviceOnlineHelp}
				onclick={() => (preferences.showDeviceOnlineHelp = !preferences.showDeviceOnlineHelp)}
				role="switch"
				aria-checked={preferences.showDeviceOnlineHelp}
			>
				<span
					class="absolute top-[2px] left-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200"
					class:translate-x-[18px]={preferences.showDeviceOnlineHelp}
				></span>
			</button>
		</div>
	</div>

	<!-- ═══ Notifications ═══ -->
	<div class="px-4">
		<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Notifications</p>
		<p class="mt-0.5 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">Control which alerts and status updates you see</p>
	</div>
	<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
		<!-- Device Offline -->
		<div class="flex items-center justify-between px-4 py-3.5">
			<div>
				<button class="text-[0.8125rem] font-medium text-[var(--sl-text-1)] text-left" onclick={() => (preferences.notifyDeviceOffline = !preferences.notifyDeviceOffline)}>Device Offline Alerts</button>
				<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Notify when device loses connection</p>
			</div>
			<button
				class="relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
				class:bg-primary={preferences.notifyDeviceOffline}
				class:bg-[var(--sl-toggle-off)]={!preferences.notifyDeviceOffline}
				onclick={() => (preferences.notifyDeviceOffline = !preferences.notifyDeviceOffline)}
				role="switch"
				aria-checked={preferences.notifyDeviceOffline}
			>
				<span
					class="absolute top-[2px] left-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200"
					class:translate-x-[18px]={preferences.notifyDeviceOffline}
				></span>
			</button>
		</div>

		<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>

		<!-- Sync Failure -->
		<div class="flex items-center justify-between px-4 py-3.5">
			<div>
				<button class="text-[0.8125rem] font-medium text-[var(--sl-text-1)] text-left" onclick={() => (preferences.notifySyncFailure = !preferences.notifySyncFailure)}>Sync Failure Alerts</button>
				<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Notify when settings fail to push to device</p>
			</div>
			<button
				class="relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
				class:bg-primary={preferences.notifySyncFailure}
				class:bg-[var(--sl-toggle-off)]={!preferences.notifySyncFailure}
				onclick={() => (preferences.notifySyncFailure = !preferences.notifySyncFailure)}
				role="switch"
				aria-checked={preferences.notifySyncFailure}
			>
				<span
					class="absolute top-[2px] left-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200"
					class:translate-x-[18px]={preferences.notifySyncFailure}
				></span>
			</button>
		</div>

		<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>

		<!-- Settings Drift -->
		<div class="flex items-center justify-between px-4 py-3.5">
			<div>
				<button class="text-[0.8125rem] font-medium text-[var(--sl-text-1)] text-left" onclick={() => (preferences.notifySettingsDrift = !preferences.notifySettingsDrift)}>Settings Drift Alerts</button>
				<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Notify when device values differ from your last known state</p>
			</div>
			<button
				class="relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
				class:bg-primary={preferences.notifySettingsDrift}
				class:bg-[var(--sl-toggle-off)]={!preferences.notifySettingsDrift}
				onclick={() => (preferences.notifySettingsDrift = !preferences.notifySettingsDrift)}
				role="switch"
				aria-checked={preferences.notifySettingsDrift}
			>
				<span
					class="absolute top-[2px] left-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200"
					class:translate-x-[18px]={preferences.notifySettingsDrift}
				></span>
			</button>
		</div>
	</div>

	<!-- ═══ Data ═══ -->
	<div class="px-4">
		<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Data</p>
		<p class="mt-0.5 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">Manage cached data and local storage</p>
	</div>
	<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
		<!-- Clear Schema Cache -->
		<div class="flex items-center justify-between px-4 py-3.5">
			<div>
				<p class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">Clear Schema Cache</p>
				<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Force re-fetch of settings schema from device</p>
			</div>
			<button
				class="rounded-lg border border-[var(--sl-border)] px-3 py-1.5 text-[0.75rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
				onclick={clearSchemaCache}
			>
				Clear
			</button>
		</div>

		<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>

		<!-- Clear Pending Changes -->
		<div class="flex items-center justify-between px-4 py-3.5">
			<div>
				<p class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">Clear Pending Changes</p>
				<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Remove all queued settings changes for current device</p>
			</div>
			<button
				class="rounded-lg border border-[var(--sl-border)] px-3 py-1.5 text-[0.75rem] font-medium text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
				onclick={clearPendingChanges}
			>
				Clear
			</button>
		</div>

		<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>

		<!-- Clear All Cached Data -->
		<div class="flex items-center justify-between px-4 py-3.5">
			<div>
				<p class="text-[0.8125rem] font-medium text-[var(--sl-text-1)]">Clear All Cached Data</p>
				<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Remove all cached schemas, values, and pending changes</p>
			</div>
			<button
				class="rounded-lg border border-red-500/30 px-3 py-1.5 text-[0.75rem] font-medium text-red-400 transition-colors hover:bg-red-500/10"
				onclick={clearAllLocalData}
			>
				Clear All
			</button>
		</div>
	</div>

	<!-- ═══ Developer (dev-only) ═══ -->
	{#if isDev}
		<div class="px-4">
			<p class="text-[0.9375rem] font-medium text-[var(--sl-text-1)]">Developer</p>
			<p class="mt-0.5 text-[0.8125rem] font-[450] text-[var(--sl-text-2)]">Debug tools and diagnostics</p>
		</div>
		<div class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]">
			<!-- Debug Mode -->
			<div class="flex items-center justify-between px-4 py-3.5">
				<div>
					<button class="text-[0.8125rem] font-medium text-[var(--sl-text-1)] text-left" onclick={() => (preferences.debugMode = !preferences.debugMode)}>Debug Mode</button>
					<p class="mt-0.5 text-[0.75rem] text-[var(--sl-text-2)]">Show setting keys instead of labels</p>
				</div>
				<button
					class="relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
					class:bg-primary={preferences.debugMode}
					class:bg-[var(--sl-toggle-off)]={!preferences.debugMode}
					onclick={() => (preferences.debugMode = !preferences.debugMode)}
					role="switch"
					aria-checked={preferences.debugMode}
				>
					<span
						class="absolute top-[2px] left-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200"
						class:translate-x-[18px]={preferences.debugMode}
					></span>
				</button>
			</div>
		</div>
	{/if}
</div>
