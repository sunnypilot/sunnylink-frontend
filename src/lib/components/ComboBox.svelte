<script lang="ts">
	import { Check, ChevronDown, Search, X } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';
	import { portal } from '$lib/utils/portal';
	import { modalLock } from '$lib/utils/modalLock';

	type Option = {
		value: string;
		label: string;
	};

	let {
		options,
		value = $bindable(),
		placeholder = 'Select an option',
		label = '',
		disabled = false,
		id = Math.random().toString(36).substring(7)
	} = $props<{
		options: Option[];
		value: string;
		placeholder?: string;
		label?: string;
		disabled?: boolean;
		id?: string;
	}>();

	let isOpen = $state(false);
	let searchQuery = $state('');
	let inputElement = $state<HTMLInputElement | undefined>();
	let containerElement = $state<HTMLDivElement | undefined>();
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuStyle = $state('position:fixed;visibility:hidden;');

	function alignMenu() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		menuStyle = `position:fixed;top:${rect.bottom + 8}px;left:${rect.left}px;width:${rect.width}px;`;
	}

	$effect(() => {
		if (!isOpen || typeof window === 'undefined') return;
		alignMenu();
		const handler = () => alignMenu();
		window.addEventListener('resize', handler);
		window.addEventListener('scroll', handler, true);
		const ro = new ResizeObserver(handler);
		ro.observe(document.body);
		return () => {
			window.removeEventListener('resize', handler);
			window.removeEventListener('scroll', handler, true);
			ro.disconnect();
		};
	});

	// Outside-click handled by portaled backdrop (use:modalLock).

	let filteredOptions = $derived(
		options.filter((option: Option) =>
			option.label.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	let selectedLabel = $derived(options.find((o: Option) => o.value === value)?.label || '');

	function toggle() {
		if (disabled) return;
		isOpen = !isOpen;
		if (isOpen) {
			searchQuery = '';
			// Use tick or timeout to focus after render
			setTimeout(() => inputElement?.focus(), 50);
		}
	}

	function select(option: Option) {
		value = option.value;
		isOpen = false;
		searchQuery = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') isOpen = false;
	}
</script>

<div class="relative w-full" bind:this={containerElement}>
	{#if label}
		<label class="mb-2 block text-sm font-medium text-[var(--sl-text-2)]" for={id}>
			{label}
		</label>
	{/if}

	<button
		{id}
		bind:this={triggerEl}
		type="button"
		class="flex w-full items-center justify-between rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-input)] p-3 text-left text-sm text-[var(--sl-text-1)] transition-colors hover:border-[var(--sl-border-emphasis)] focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		onclick={toggle}
		{disabled}
	>
		<span class={selectedLabel ? 'text-[var(--sl-text-1)]' : 'text-[var(--sl-text-2)]'}>
			{selectedLabel || placeholder}
		</span>
		<ChevronDown
			size={16}
			class="ml-2 text-[var(--sl-text-3)] transition-transform {isOpen ? 'rotate-180' : ''}"
		/>
	</button>

	<!-- Dropdown -->
	{#if isOpen}
		<!-- Portaled backdrop swallows outside-click + locks body scroll -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			use:portal
			use:modalLock
			class="fixed inset-0 z-[9998]"
			transition:fade={{ duration: 120 }}
			onclick={(e) => {
				e.stopPropagation();
				isOpen = false;
			}}
		></div>
		<div
			use:portal
			class="z-[9999] overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-xl ring-1 ring-black/5"
			style={menuStyle}
			transition:fly={{ y: 10, duration: 200 }}
		>
			<!-- Search Input -->
			<div class="border-b border-[var(--sl-border)] p-2">
				<div class="relative">
					<Search
						size={16}
						class="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--sl-text-2)]"
					/>
					<input
						bind:this={inputElement}
						bind:value={searchQuery}
						onkeydown={handleKeydown}
						type="text"
						class="w-full rounded-lg bg-[var(--sl-bg-input)] py-2.5 pr-4 pl-9 text-sm text-[var(--sl-text-1)] placeholder-[var(--sl-text-3)] focus:ring-2 focus:ring-primary/50 focus:outline-none"
						placeholder="Search..."
					/>
				</div>
			</div>

			<!-- Options List -->
			<div class="max-h-60 overflow-y-auto p-1">
				{#if filteredOptions.length === 0}
					<div class="px-4 py-3 text-center text-sm text-[var(--sl-text-3)]">No results found</div>
				{:else}
					{#each filteredOptions as option (option.value)}
						<button
							type="button"
							class="group flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left text-sm text-[var(--sl-text-2)] hover:bg-[var(--sl-accent-muted)] hover:text-[var(--sl-text-1)]"
							onclick={() => select(option)}
						>
							<span>{option.label}</span>
							{#if value === option.value}
								<Check size={16} class="text-primary" />
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
