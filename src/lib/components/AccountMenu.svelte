<script lang="ts">
	import { authState, logtoClient } from '$lib/logto/auth.svelte';
	import { themeState, type ThemePreference } from '$lib/stores/theme.svelte';
	import { Sun, Moon, Monitor, LifeBuoy, Settings, LogOut, ChevronUp } from 'lucide-svelte';

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

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('[data-account-menu]')) {
			open = false;
		}
	}

	$effect(() => {
		if (open) {
			document.addEventListener('click', handleClickOutside, true);
			return () => document.removeEventListener('click', handleClickOutside, true);
		}
	});

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
	<!-- Trigger: user profile button -->
	<button
		type="button"
		class="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 hover:bg-[var(--sl-bg-subtle)]"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-haspopup="true"
	>
		<span class="placeholder avatar">
			<span
				class="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--sl-bg-elevated)] text-[var(--sl-text-2)] transition-colors group-hover:text-[var(--sl-text-1)]"
			>
				{#if authState.profile?.picture}
					<img
						src={authState.profile.picture}
						alt={authState.profile?.name || ''}
						class="h-7 w-7 rounded-full"
					/>
				{:else}
					<span class="text-[0.6rem] font-medium">{initials}</span>
				{/if}
			</span>
		</span>
		<span class="flex flex-1 flex-col overflow-hidden">
			<span class="truncate text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
				{authState.profile?.name}
			</span>
			<span class="text-[0.6rem] tracking-[0.2em] text-[var(--sl-text-3)] uppercase">Account</span>
		</span>
		<ChevronUp
			size={14}
			class="text-[var(--sl-text-3)] transition-transform duration-150 {open ? '' : 'rotate-180'}"
		/>
	</button>

	<!-- Popover menu -->
	{#if open}
		<div
			class="absolute bottom-full left-0 right-0 z-50 mb-1.5 overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]"
			role="menu"
		>
			<!-- User identity -->
			<div class="px-3.5 pt-3 pb-2">
				<p class="truncate text-[0.8125rem] font-medium text-[var(--sl-text-1)]">
					{authState.profile?.name}
				</p>
				{#if authState.profile?.email}
					<p class="truncate text-xs text-[var(--sl-text-3)]">{authState.profile.email}</p>
				{/if}
			</div>

			<div class="mx-3 border-b border-[var(--sl-border-muted)]"></div>

			<!-- Theme selector -->
			<div class="px-3.5 py-3">
				<p class="mb-2 text-[0.6875rem] font-semibold tracking-wider text-[var(--sl-text-3)] uppercase">
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

			<div class="mx-3 border-b border-[var(--sl-border-muted)]"></div>

			<!-- Menu items -->
			<div class="py-1">
				<a
					href="/dashboard/preferences"
					class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8125rem] text-[var(--sl-text-2)] transition-colors duration-150 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
					role="menuitem"
					onclick={() => (open = false)}
				>
					<Settings size={15} class="shrink-0" />
					<span>Preferences</span>
				</a>
				<a
					href="https://community.sunnypilot.ai/c/bug-reports/8"
					target="_blank"
					rel="noopener"
					class="flex items-center gap-2.5 px-3.5 py-2 text-[0.8125rem] text-[var(--sl-text-2)] transition-colors duration-150 hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-1)]"
					role="menuitem"
					onclick={() => (open = false)}
				>
					<LifeBuoy size={15} class="shrink-0" />
					<span>Support</span>
				</a>
			</div>

			<div class="mx-3 border-b border-[var(--sl-border-muted)]"></div>

			<!-- Logout -->
			<div class="py-1">
				<button
					type="button"
					class="flex w-full items-center gap-2.5 px-3.5 py-2 text-[0.8125rem] text-[var(--sl-text-2)] transition-colors duration-150 hover:bg-[var(--sl-bg-subtle)] hover:text-red-400"
					role="menuitem"
					onclick={handleLogout}
				>
					<LogOut size={15} class="shrink-0" />
					<span>Log out</span>
				</button>
			</div>
		</div>
	{/if}
</div>
