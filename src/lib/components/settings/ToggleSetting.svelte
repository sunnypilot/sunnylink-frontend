<script lang="ts">
	type ToggleProps = {
		label: string;
		description?: string;
		value: boolean;
		disabled?: boolean;
		loading?: boolean;
		name?: string;
		id?: string;
		onChange?: (value: boolean) => void;
	};

	let {
		label,
		description,
		value,
		disabled = false,
		loading = false,
		name,
		id,
		onChange
	}: ToggleProps = $props();

	const isDisabled = $derived(disabled || loading);

	function handleChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		onChange?.(target.checked);
	}
</script>

<div class="flex items-start justify-between gap-4 rounded-lg border border-base-300 bg-base-200/40 p-4">
	<div class="flex-1">
		<label class="font-medium" for={id}>{label}</label>
		{#if description}
			<p class="mt-1 text-sm opacity-70">{description}</p>
		{/if}
	</div>
	<div class="flex items-center gap-2">
		{#if loading}
			<span class="loading loading-spinner loading-sm text-primary" aria-hidden="true"></span>
		{/if}
		<input
			type="checkbox"
			{name}
			{id}
			class="toggle toggle-primary"
			checked={value}
			disabled={isDisabled}
			onchange={handleChange}
			aria-checked={value}
			aria-disabled={isDisabled}
		/>
	</div>
</div>
