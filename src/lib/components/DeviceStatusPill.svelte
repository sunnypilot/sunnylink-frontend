<script lang="ts">
	import { goto } from '$app/navigation';
	import { scale } from 'svelte/transition';
	import { deviceState } from '$lib/stores/device.svelte';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { checkDeviceStatus } from '$lib/api/device';
	import { v0Client } from '$lib/api/client';
	import { encodeParamValue } from '$lib/utils/device';
	import { formatRelativeTime } from '$lib/utils/time';
	import { statusPolling } from '$lib/stores/statusPolling.svelte';
	import ForceOffroadModal from '$lib/components/ForceOffroadModal.svelte';
	import {
		RefreshCw,
		Loader2,
		AlertTriangle,
		Copy,
		Check,
		ChevronRight,
		Monitor,
		GitBranch
	} from 'lucide-svelte';

	/**
	 * Device Status Pill
	 *
	 * Clickable pill in the header showing device connection + offroad state.
	 * Opens a popover with device identity, telemetry, and quick actions.
	 */

	type PillState = {
		label: string;
		dotClass: string;
		bgClass: string;
		textClass: string;
		borderClass: string;
		pulse?: boolean;
	};

	const DEVICE_TYPE_NAMES: Record<string, string> = {
		tizi: 'comma 3X',
		mici: 'comma four',
		tici: 'comma three',
		pc: 'PC'
	};

	let deviceId = $derived(deviceState.selectedDeviceId);
	let onlineStatus = $derived(deviceId ? deviceState.onlineStatuses[deviceId] : undefined);
	let offroadStatus = $derived(deviceId ? deviceState.offroadStatuses[deviceId] : undefined);
	let telemetry = $derived(deviceId ? deviceState.deviceTelemetry[deviceId] : undefined);
	let isOnline = $derived(onlineStatus === 'online');
	let errorMessage = $derived(deviceId ? deviceState.lastErrorMessages[deviceId] : undefined);
	let lastSeen = $derived.by(() => {
		if (!deviceId) return undefined;
		if (onlineStatus === 'online') {
			return deviceState.lastStatusCheck[deviceId];
		}
		// Offline/error: show when device was last online
		return deviceState.lastSeenOnline[deviceId];
	});
	let deviceValues = $derived(deviceId ? deviceState.deviceValues[deviceId] : undefined);

	// Device name: check unsaved overrides → persisted aliases → raw ID
	let deviceName = $derived.by(() => {
		if (!deviceId) return '';
		return deviceState.aliasOverrides[deviceId] ?? deviceState.aliases[deviceId] ?? deviceId;
	});

	// Software version from GitCommit (short hash)
	// Software version string (e.g., "2026.001.000")
	let softwareVersion = $derived.by(() => {
		return (deviceValues?.['Version'] as string | undefined) ?? null;
	});

	// Git commit short hash
	let commitHash = $derived.by(() => {
		const commit = deviceValues?.['GitCommit'] as string | undefined;
		if (!commit) return null;
		return commit.slice(0, 8);
	});

	// Branch name
	let branchName = $derived.by(() => {
		return (deviceValues?.['GitBranch'] as string | undefined) ?? null;
	});

	// Device type friendly name
	let deviceTypeName = $derived.by(() => {
		const type = telemetry?.deviceType;
		if (!type || type === 'unknown') return null;
		return DEVICE_TYPE_NAMES[type.toLowerCase()] ?? null;
	});

	// Popover state
	let popoverOpen = $state(false);
	let pillRef = $state<HTMLElement | null>(null);
	let refreshing = $state(false);
	let stoppingForce = $state(false);
	let forceModalOpen = $state(false);
	let copiedId = $state(false);
	let copiedField = $state<string | null>(null);
	let marqueeEl = $state<HTMLElement | undefined>();

	let marqueeOverflows = $state(false);

	$effect(() => {
		if (!marqueeEl || !popoverOpen) return;
		// The first <span> child of .marquee-track is the original text
		const track = marqueeEl.querySelector('.marquee-track');
		const firstSpan = track?.children[0] as HTMLElement | undefined;
		if (!firstSpan || !marqueeEl) return;
		const textWidth = firstSpan.offsetWidth;
		const containerWidth = marqueeEl.clientWidth;
		if (textWidth > containerWidth) {
			// scroll distance = one full copy + gap
			const gap = containerWidth * 0.33;
			marqueeEl.style.setProperty('--marquee-scroll', `-${textWidth + gap}px`);
			marqueeEl.style.setProperty('--marquee-duration', `${Math.max(4, (textWidth + gap) / 30)}s`);
			marqueeOverflows = true;
		} else {
			marqueeOverflows = false;
		}
	});

	let pillState: PillState = $derived.by(() => {
		if (!deviceId) {
			return {
				label: 'No Device',
				dotClass: 'bg-[var(--sl-text-3)]/40',
				bgClass: 'bg-[var(--sl-bg-elevated)]',
				textClass: 'text-[var(--sl-text-3)]',
				borderClass: 'border-[var(--sl-border-muted)]'
			};
		}

		if (onlineStatus === 'loading' || onlineStatus === undefined) {
			return {
				label: 'Connecting...',
				dotClass: 'bg-[var(--sl-text-3)]',
				bgClass: 'bg-[var(--sl-bg-elevated)]',
				textClass: 'text-[var(--sl-text-3)]',
				borderClass: 'border-[var(--sl-border-muted)]',
				pulse: true
			};
		}

		if (onlineStatus === 'error') {
			return {
				label: 'Unreachable',
				dotClass: 'bg-red-400',
				bgClass: 'bg-red-500/8 dark:bg-red-500/10',
				textClass: 'text-red-600 dark:text-red-400',
				borderClass: 'border-red-500/20'
			};
		}

		if (onlineStatus === 'offline') {
			return {
				label: 'Offline',
				dotClass: 'bg-[var(--sl-text-3)]/50',
				bgClass: 'bg-[var(--sl-bg-elevated)]',
				textClass: 'text-[var(--sl-text-3)]',
				borderClass: 'border-[var(--sl-border-muted)]'
			};
		}

		if (offroadStatus?.forceOffroad) {
			return {
				label: 'Forced Offroad',
				dotClass: 'bg-amber-400',
				bgClass: 'bg-amber-500/8 dark:bg-amber-500/10',
				textClass: 'text-amber-600 dark:text-amber-400',
				borderClass: 'border-amber-500/20'
			};
		}

		if (offroadStatus?.isOffroad === false) {
			return {
				label: 'Onroad',
				dotClass: 'bg-blue-400',
				bgClass: 'bg-blue-500/8 dark:bg-blue-500/10',
				textClass: 'text-blue-600 dark:text-blue-400',
				borderClass: 'border-blue-500/20'
			};
		}

		return {
			label: 'Offroad',
			dotClass: 'bg-emerald-400',
			bgClass: 'bg-emerald-500/8 dark:bg-emerald-500/10',
			textClass: 'text-emerald-600 dark:text-emerald-400',
			borderClass: 'border-emerald-500/20'
		};
	});

	function togglePopover() {
		popoverOpen = !popoverOpen;
	}

	function closePopover() {
		popoverOpen = false;
	}

	function handleWindowClick(e: MouseEvent) {
		if (popoverOpen && pillRef && !pillRef.contains(e.target as Node)) {
			closePopover();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && popoverOpen) {
			closePopover();
		}
	}

	async function refreshStatus() {
		if (!deviceId) return;
		refreshing = true;
		try {
			const token = await logtoClient?.getIdToken();
			if (token) await checkDeviceStatus(deviceId, token, true);
		} catch (e) {
			console.error('Failed to refresh device status', e);
		} finally {
			refreshing = false;
		}
	}

	async function stopForceOffroad() {
		if (!deviceId) return;
		stoppingForce = true;
		try {
			const token = await logtoClient?.getIdToken();
			if (!token) return;
			const payload = [
				{
					key: 'OffroadMode',
					value: encodeParamValue({ key: 'OffroadMode', value: false, type: 'Bool' }),
					is_compressed: false
				}
			];
			await v0Client.POST('/settings/{deviceId}', {
				params: { path: { deviceId } },
				body: payload,
				headers: { Authorization: `Bearer ${token}` }
			});
			await checkDeviceStatus(deviceId, token, true);
		} catch (e) {
			console.error('Failed to stop force offroad', e);
		} finally {
			stoppingForce = false;
		}
	}

	function handleForceOffroadClick() {
		if (offroadStatus?.forceOffroad) {
			stopForceOffroad();
		} else {
			closePopover();
			forceModalOpen = true;
		}
	}

	async function onForceOffroadSuccess() {
		if (!deviceId) return;
		try {
			const token = await logtoClient?.getIdToken();
			if (token) await checkDeviceStatus(deviceId, token, true);
		} catch {
			/* ignore */
		}
	}

	async function copyDeviceId() {
		if (!deviceId) return;
		try {
			await navigator.clipboard.writeText(deviceId);
			copiedId = true;
			setTimeout(() => {
				copiedId = false;
			}, 2000);
		} catch {
			/* ignore */
		}
	}

	async function copyField(field: string, value: string | undefined) {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			copiedField = field;
			setTimeout(() => {
				copiedField = null;
			}, 2000);
		} catch {
			/* ignore */
		}
	}

	function formatNetworkType(type: string | undefined): string {
		if (!type || type === 'unknown') return '--';
		const map: Record<string, string> = {
			wifi: 'WiFi',
			cellular: 'Cellular',
			ethernet: 'Ethernet',
			none: 'None'
		};
		return map[type.toLowerCase()] ?? type;
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

{#if deviceId}
	<div class="relative" bind:this={pillRef}>
		<button
			onclick={togglePopover}
			class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors duration-[var(--dur-fast)] hover:brightness-110 {pillState.bgClass} {pillState.borderClass}"
			aria-label="Device status: {pillState.label}"
			aria-expanded={popoverOpen}
		>
			<span
				class="block h-[6px] w-[6px] shrink-0 rounded-full {pillState.dotClass}"
				class:animate-pulse={pillState.pulse}
			></span>
			<span class="text-[0.75rem] leading-none font-medium {pillState.textClass}">
				{pillState.label}
			</span>
		</button>

		{#if popoverOpen}
			<div
				transition:scale={{ start: 0.95, duration: 150, opacity: 0 }}
				class="absolute top-full right-0 z-[100] mt-2 w-72 origin-top-right rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] p-1.5 shadow-sm"
				role="dialog"
				aria-label="Device status details"
			>
				<div class="px-2.5 pt-2 pb-2">
					<div class="flex items-center justify-between">
						<span class="text-[0.875rem] font-semibold text-[var(--sl-text-1)]">
							{deviceName}
						</span>
						<button
							onclick={refreshStatus}
							disabled={refreshing}
							class="rounded-md p-1 text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)]"
							aria-label="Refresh status"
						>
							<RefreshCw size={14} class={refreshing ? 'animate-spin' : ''} />
						</button>
					</div>
					<div class="mt-1 flex items-center gap-1.5 text-[0.75rem] text-[var(--sl-text-2)]">
						<span
							class="block h-[6px] w-[6px] shrink-0 rounded-full {pillState.dotClass}"
							class:animate-pulse={pillState.pulse}
						></span>
						<span>{pillState.label}</span>
						{#if deviceTypeName}
							<span class="text-[var(--sl-text-3)]">&middot;</span>
							<Monitor size={11} class="shrink-0 text-[var(--sl-text-3)]" />
							<span>{deviceTypeName}</span>
						{/if}
					</div>
				</div>

				<div class="my-1 border-b border-[var(--sl-border-muted)]"></div>

				<div class="space-y-0.5 px-1">
					{#if isOnline && telemetry}
						<div class="flex items-center justify-between rounded-md px-1.5 py-1">
							<span class="text-[0.75rem] text-[var(--sl-text-3)]">Network</span>
							<span class="text-[0.75rem] text-[var(--sl-text-2)]">
								{formatNetworkType(telemetry.networkType)}
								{#if telemetry.networkMetered}
									<span class="text-amber-700 dark:text-amber-400">(metered)</span>
								{/if}
							</span>
						</div>
					{/if}
					{#if branchName}
						<button
							class="group relative flex w-full cursor-pointer items-center justify-between rounded-md px-1.5 py-1 transition-colors hover:bg-[var(--sl-bg-elevated)]"
							onclick={() => copyField('branch', branchName)}
						>
							<span class="text-[0.75rem] text-[var(--sl-text-3)]">Branch</span>
							{#if copiedField === 'branch'}
								<Check size={12} class="shrink-0 text-emerald-600 dark:text-emerald-400" />
							{:else}
								<span
									bind:this={marqueeEl}
									class="marquee-container max-w-[140px] overflow-hidden"
									class:overflows={marqueeOverflows}
								>
									<span
										class="marquee-track font-mono text-[0.75rem] whitespace-nowrap text-[var(--sl-text-2)]"
									>
										<span>{branchName}</span>
										{#if marqueeOverflows}
											<span class="marquee-gap"></span>
											<span>{branchName}</span>
										{/if}
									</span>
								</span>
							{/if}
						</button>
					{/if}
					{#if softwareVersion}
						<button
							class="group relative flex w-full cursor-pointer items-center justify-between rounded-md px-1.5 py-1 transition-colors hover:bg-[var(--sl-bg-elevated)]"
							onclick={() => copyField('version', softwareVersion)}
						>
							<span class="text-[0.75rem] text-[var(--sl-text-3)]">Version</span>
							{#if copiedField === 'version'}
								<Check size={12} class="shrink-0 text-emerald-600 dark:text-emerald-400" />
							{:else}
								<span class="text-[0.75rem] text-[var(--sl-text-2)]">{softwareVersion}</span>
							{/if}
						</button>
					{/if}
					{#if commitHash}
						<button
							class="group relative flex w-full cursor-pointer items-center justify-between rounded-md px-1.5 py-1 transition-colors hover:bg-[var(--sl-bg-elevated)]"
							onclick={() => copyField('commit', commitHash)}
						>
							<span class="text-[0.75rem] text-[var(--sl-text-3)]">Commit</span>
							{#if copiedField === 'commit'}
								<Check size={12} class="shrink-0 text-emerald-600 dark:text-emerald-400" />
							{:else}
								<span class="font-mono text-[0.75rem] text-[var(--sl-text-2)]">{commitHash}</span>
							{/if}
						</button>
					{/if}
					{#if lastSeen}
						<div class="flex items-center justify-between rounded-md px-1.5 py-1">
							<span class="text-[0.75rem] text-[var(--sl-text-3)]">Last seen</span>
							<!-- Force re-render every 10s via statusPolling tick -->
							{#key statusPolling.tickCounter}
								<span class="text-[0.75rem] text-[var(--sl-text-2)]">
									{formatRelativeTime(lastSeen)}
								</span>
							{/key}
						</div>
					{/if}
					{#if onlineStatus === 'error' && errorMessage}
						<div class="flex items-center gap-1.5">
							<AlertTriangle size={13} class="shrink-0 text-red-600 dark:text-red-400" />
							<span class="text-[0.75rem] text-red-600 dark:text-red-400">{errorMessage}</span>
						</div>
					{:else if onlineStatus === 'offline' && !lastSeen}
						<div>
							<span class="text-[0.75rem] text-[var(--sl-text-3)]">Device is not connected</span>
						</div>
					{/if}
				</div>

				{#if isOnline}
					<div class="my-1 border-b border-[var(--sl-border-muted)]"></div>
					<button
						onclick={handleForceOffroadClick}
						disabled={stoppingForce}
						class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[0.75rem] text-[var(--sl-text-2)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-1)] disabled:opacity-50"
					>
						{#if stoppingForce}
							<Loader2 size={13} class="shrink-0 animate-spin" />
							<span>Stopping...</span>
						{:else if offroadStatus?.forceOffroad}
							<AlertTriangle size={13} class="shrink-0 text-amber-600 dark:text-amber-400" />
							<span>Stop Force Offroad</span>
						{:else}
							<AlertTriangle size={13} class="shrink-0" />
							<span>Force Offroad</span>
						{/if}
					</button>
				{/if}

				<div class="my-1 border-b border-[var(--sl-border-muted)]"></div>
				<div class="flex items-center justify-between">
					<button
						onclick={copyDeviceId}
						class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.6875rem] text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-2)]"
						aria-label="Copy device ID"
					>
						{#if copiedId}
							<Check size={11} class="shrink-0 text-emerald-600 dark:text-emerald-400" />
							<span class="text-emerald-600 dark:text-emerald-400">Copied</span>
						{:else}
							<Copy size={11} class="shrink-0" />
							<span>Copy Device ID</span>
						{/if}
					</button>
					<button
						onclick={() => {
							closePopover();
							goto('/dashboard');
						}}
						class="flex items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[0.6875rem] text-[var(--sl-text-3)] transition-colors hover:bg-[var(--sl-bg-elevated)] hover:text-[var(--sl-text-2)] active:bg-[var(--sl-bg-subtle)]"
					>
						<span>Overview</span>
						<ChevronRight size={12} />
					</button>
				</div>
			</div>
		{/if}
	</div>

	<ForceOffroadModal bind:open={forceModalOpen} onSuccess={onForceOffroadSuccess} />
{/if}

<style>
	.marquee-container {
		display: inline-block;
	}
	.marquee-container.overflows {
		-webkit-mask-image: linear-gradient(to right, black, black calc(100% - 14px), transparent);
		mask-image: linear-gradient(to right, black, black calc(100% - 14px), transparent);
	}
	.marquee-track {
		display: inline-flex;
		align-items: center;
	}
	.marquee-gap {
		display: inline-block;
		width: 46px;
		flex-shrink: 0;
	}
	.marquee-container.overflows .marquee-track {
		animation: marquee-scroll var(--marquee-duration, 6s) linear 2s infinite;
	}
	@keyframes marquee-scroll {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(var(--marquee-scroll, 0px));
		}
	}
</style>
