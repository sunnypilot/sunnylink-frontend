<script lang="ts">
	type Option = {
		label: string;
		value: number;
	};

	type SelectProps = {
		label: string;
		description?: string;
		options: Option[];
		value: number | null;
		placeholder?: string;
		disabled?: boolean;
		loading?: boolean;
		name?: string;
		id?: string;
		onChange?: (value: number | null) => void;
	};

	let {
		label,
		description,
		options,
		value,
		placeholder,
		disabled = false,
		loading = false,
		name,
		id,
		onChange
	}: SelectProps = $props();

	const isDisabled = $derived(disabled || loading);

	const selectedValue = $derived(value === null ? '' : value.toString());

	const optionsToRender = $derived.by(() => {
		if (value === null) {
			return options;
		}
		const hasMatchingOption = options.some((option) => option.value === value);
		return hasMatchingOption ? options : [{ label: `Current (${value})`, value }, ...options];
	});

	function handleChange(event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		const parsedValue = target.value === '' ? null : Number.parseInt(target.value, 10);
		const nextValue = parsedValue === null || Number.isNaN(parsedValue) ? null : parsedValue;
		onChange?.(nextValue);
	}
</script>

<div class="border-base-300 bg-base-200/40 space-y-2 rounded-lg border p-4">
	<div class="flex items-start justify-between gap-2">
		<div class="flex-1">
			<label class="font-medium" for={id}>{label}</label>
			{#if description}
				<p class="mt-1 text-sm opacity-70">{description}</p>
			{/if}
		</div>
		{#if loading}
			<span class="loading loading-spinner loading-sm text-primary" aria-hidden="true"></span>
		{/if}
	</div>
	<select
		class="select select-bordered w-full"
		{name}
		{id}
		value={selectedValue}
		disabled={isDisabled}
		onchange={handleChange}
	>
		<option value="" disabled>{placeholder ?? 'Select an option'}</option>
		{#each optionsToRender as option}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
</div>
