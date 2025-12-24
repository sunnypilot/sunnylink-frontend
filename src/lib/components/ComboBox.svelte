<script lang="ts">
	import { Check, ChevronDown, Search, X } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';

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

<div class="relative w-full">
	{#if label}
		<label class="mb-2 block text-sm font-medium text-slate-300" for={id}>
			{label}
		</label>
	{/if}

	<!-- Trigger -->
	<button
		{id}
		type="button"
		class="flex w-full items-center justify-between rounded-lg border border-[#334155] bg-[#0f1726] p-3 text-left text-sm text-white transition-colors hover:border-[#475569] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		onclick={toggle}
		{disabled}
	>
		<span class={selectedLabel ? 'text-white' : 'text-slate-400'}>
			{selectedLabel || placeholder}
		</span>
		<ChevronDown
			size={16}
			class="ml-2 text-slate-500 transition-transform {isOpen ? 'rotate-180' : ''}"
		/>
	</button>

	<!-- Dropdown -->
	{#if isOpen}
		<!-- Backdrop to close on click outside -->
		<button
			type="button"
			class="fixed inset-0 z-10 cursor-default bg-transparent"
			onclick={() => (isOpen = false)}
			aria-label="Close dropdown"
		></button>

		<div
			class="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[#334155] bg-[#1e293b] shadow-xl ring-1 ring-black/5"
			transition:fly={{ y: 10, duration: 200 }}
		>
			<!-- Search Input -->
			<div class="border-b border-[#334155] p-2">
				<div class="relative">
					<Search size={16} class="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
					<input
						bind:this={inputElement}
						bind:value={searchQuery}
						onkeydown={handleKeydown}
						type="text"
						class="w-full rounded-lg bg-[#0f1726] py-2 pr-4 pl-9 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500/50 focus:outline-none"
						placeholder="Search..."
					/>
				</div>
			</div>

			<!-- Options List -->
			<div class="max-h-60 overflow-y-auto p-1">
				{#if filteredOptions.length === 0}
					<div class="px-4 py-3 text-center text-sm text-slate-500">No results found</div>
				{:else}
					{#each filteredOptions as option (option.value)}
						<button
							type="button"
							class="group flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-sm text-slate-300 hover:bg-indigo-500/10 hover:text-white"
							onclick={() => select(option)}
						>
							<span>{option.label}</span>
							{#if value === option.value}
								<Check size={16} class="text-indigo-400" />
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
