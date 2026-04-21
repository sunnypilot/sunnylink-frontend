<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { themeState, type ThemePreference } from '$lib/stores/theme.svelte';
	import { Sun, Moon, Monitor, LifeBuoy, Settings, LogOut, ChevronsUpDown } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';

	interface Props {
		onNavigate?: () => void;
	}

	let { onNavigate }: Props = $props();

	let open = $state(false);

	const themeOptions: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
		{ value: 'light', icon: Sun, label: 'Light' },
		{ value: 'dark', icon: Moon, label: 'Dark' },
		{ value: 'auto', icon: Monitor, label: 'System' }
	];

	const handleLogout = async () => {
		open = false;
		await logtoClient?.signOut(window.location.origin);
	};

	// Outside-click handled by portaled backdrop (use:modalLock); document
	// click listener removed so clicks below the backdrop don't pass through.

	// Close on Escape
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
		}
	}

	const initials = $derived(
		authState.profile?.name
			?.split(' ')
			.map((n) => n[0])
			.join('') ?? ''
	);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative" data-account-menu>
	<button
		type="button"
		class="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-[var(--sl-bg-subtle)]"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-haspopup="true"
	>
		<span
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--sl-bg-elevated)] text-[var(--sl-text-2)] transition-colors group-hover:text-[var(--sl-text-1)]"
		>
			{#if authState.profile?.picture}
				<img
					src={authState.profile.picture}
					alt={authState.profile?.name || ''}
					class="h-8 w-8 rounded-lg object-cover"
				/>
			{:else}
				<span class="text-[0.65rem] font-semibold">{initials}</span>
			{/if}
		</span>
		<span class="flex min-w-0 flex-1 flex-col overflow-hidden">
			<span class="truncate text-[0.8125rem] font-semibold text-[var(--sl-text-1)]">
				{authState.profile?.name}
			</span>
			{#if authState.profile?.email}
				<span class="truncate text-[0.6875rem] text-[var(--sl-text-3)]"
					>{authState.profile.email}</span
				>
			{/if}
		</span>
		<ChevronsUpDown size={14} class="shrink-0 text-[var(--sl-text-3)]" />
	</button>

	{#if open}
		<!-- Portaled backdrop swallows outside-click + locks body scroll -->
		<div use:portal>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				use:modalLock
				class="fixed inset-0 z-[9998]"
				transition:fade={{ duration: 120 }}
				onmousedown={(e) => {
					e.preventDefault();
					e.stopPropagation();
					open = false;
				}}
				ontouchstart={(e) => {
					e.preventDefault();
					e.stopPropagation();
					open = false;
				}}
			></div>
		</div>
		<div
			class="absolute right-0 bottom-full left-0 z-[9999] mb-1.5 origin-bottom rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-1.5"
			role="menu"
			transition:scale={{ start: 0.95, duration: 150, opacity: 0 }}
		>
			<div class="px-2.5 pt-1.5 pb-1.5">
				<p class="truncate text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
					{authState.profile?.name}
				</p>
				{#if authState.profile?.email}
					<p class="truncate text-xs text-[var(--sl-text-3)]">{authState.profile.email}</p>
				{/if}
			</div>

			<div class="my-1 border-b border-[var(--sl-border-muted)]"></div>

			<div class="px-2.5 py-2">
				<p class="mb-2 text-xs font-semibold tracking-wider text-[var(--sl-text-3)] uppercase">
					Theme
				</p>
				<div class="flex rounded-lg bg-[var(--sl-bg-input)] p-1">
					{#each themeOptions as opt}
						{@const isActive = themeState.preference === opt.value}
						<button
							type="button"
							class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs transition-all duration-150"
							class:bg-[var(--sl-bg-surface)]={isActive}
							class:shadow-sm={isActive}
							class:text-[var(--sl-text-1)]={isActive}
							class:font-medium={isActive}
							class:text-[var(--sl-text-3)]={!isActive}
							class:hover:text-[var(--sl-text-2)]={!isActive}
							role="menuitem"
							aria-label="{opt.label} theme"
							onclick={() => themeState.setPreference(opt.value)}
						>
							<opt.icon size={14} />
							<span>{opt.label}</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="my-1 border-b border-[var(--sl-border-muted)]"></div>

			<div class="space-y-0.5">
				<a
					href="/dashboard/preferences"
					class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-2)] transition-colors duration-150 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
					role="menuitem"
					onclick={() => {
						open = false;
						onNavigate?.();
					}}
				>
					<Settings size={15} class="shrink-0" />
					<span>Preferences</span>
				</a>
				<a
					href="https://community.sunnypilot.ai/c/bug-reports/8"
					target="_blank"
					rel="noopener"
					class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-2)] transition-colors duration-150 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
					role="menuitem"
					onclick={() => (open = false)}
				>
					<LifeBuoy size={15} class="shrink-0" />
					<span>Support</span>
				</a>
			</div>

			<div class="my-1 border-b border-[var(--sl-border-muted)]"></div>

			<button
				type="button"
				class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] text-[var(--sl-text-2)] transition-colors duration-150 hover:bg-[var(--sl-bg-subtle)] hover:text-red-400"
				role="menuitem"
				onclick={handleLogout}
			>
				<LogOut size={15} class="shrink-0" />
				<span>Log out</span>
			</button>
		</div>
	{/if}
</div>
