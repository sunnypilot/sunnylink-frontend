<script lang="ts">
	let { name } = $props<{ name?: string }>();
</script>

<div class="mx-auto w-full max-w-2xl space-y-6 xl:max-w-3xl">
	<div class="flex items-center justify-between">
		<div class="h-3 w-16 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
		<div class="h-3 w-20 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
	</div>

	<div
		class="overflow-hidden rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)]"
	>
		{#each [1, 2] as _, i}
			<div class="flex items-center gap-3 px-4 py-3.5">
				<div class="h-[6px] w-[6px] animate-pulse rounded-full bg-[var(--sl-bg-elevated)]"></div>
				<div class="min-w-0 flex-1 space-y-2">
					<div class="h-4 w-32 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
					<div class="h-3 w-48 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
				</div>
				<div class="h-5 w-5 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
			</div>
			{#if i === 0}
				<div class="mx-4 border-b border-[var(--sl-border-muted)]"></div>
			{/if}
		{/each}
	</div>
</div>
