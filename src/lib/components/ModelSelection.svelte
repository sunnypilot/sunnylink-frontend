<script lang="ts">
	import { type ModelBundle } from '$lib/types/models-v7';
	import { fly } from 'svelte/transition';

	interface Props {
		models: ModelBundle[];
		selectedModel?: number;
		disabled?: boolean;
		onSelect: (modelIndex: number) => void;
	}

	let { models, selectedModel, disabled = false, onSelect }: Props = $props();

	let dropdownOpen = $state(false);
	let searchQuery = $state('');

	const filteredModels = $derived(
		models.filter((model) => model.display_name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	const handleSelect = (modelIndex: number) => {
		onSelect(modelIndex);
		dropdownOpen = false;
		searchQuery = '';
	};

	const handleClickOutside = (event: MouseEvent) => {
		const target = event.target as Element;
		if (!target.closest('[data-model-dropdown]')) {
			dropdownOpen = false;
		}
	};
</script>

<svelte:document onclick={handleClickOutside} />

<div class="space-y-2">
	<label for="model-select" class="text-sm font-medium">Model</label>
	<div class="relative" data-model-dropdown>
		<button
			id="model-select"
			onclick={() => (dropdownOpen = !dropdownOpen)}
			{disabled}
			class="btn btn-outline w-full justify-between"
		>
			<span>
				{models.find((m) => m.index === selectedModel)?.display_name || 'Select a model...'}
			</span>
			<svg
				class="h-4 w-4 transition-transform {dropdownOpen ? 'rotate-180' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if dropdownOpen}
			<div
				class="dropdown-content menu rounded-box bg-base-100 absolute z-10 mt-1 w-full shadow-lg"
				transition:fly={{ y: -4, duration: 200 }}
			>
				<div class="border-b p-2">
					<input
						bind:value={searchQuery}
						placeholder="Search models..."
						class="input input-bordered input-sm w-full"
					/>
				</div>
				<div class="max-h-64 overflow-auto py-1">
					{#if filteredModels.length === 0}
						<div class="px-3 py-2 text-sm opacity-60">No models found</div>
					{:else}
						{#each filteredModels as model}
							<button
								onclick={() => handleSelect(model.index)}
								class="hover:bg-base-200 flex w-full items-center px-3 py-2 text-left text-sm {selectedModel ===
								model.index
									? 'bg-base-200 font-medium'
									: ''}"
							>
								<div class="min-w-0 flex-1">
									<div class="truncate font-medium">{model.display_name}</div>
									<div class="text-xs opacity-60">Generation {model.generation}</div>
								</div>
								{#if selectedModel === model.index}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>