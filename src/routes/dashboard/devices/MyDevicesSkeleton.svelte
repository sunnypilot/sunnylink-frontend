<script lang="ts">
	let { count = 3 }: { count?: number } = $props();
	const placeholders = Array.from({ length: count });
</script>

<div class="mx-auto w-full max-w-2xl pb-24 xl:max-w-3xl">
	<div class="mb-6 flex items-end justify-between gap-3 px-4">
		<div class="space-y-2">
			<div class="h-6 w-32 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
			<div class="h-3 w-20 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
		</div>
		<div class="h-6 w-6 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
	</div>

	<div class="flex flex-col gap-3" aria-hidden="true">
		{#each placeholders as _, i (i)}
			<article
				class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-3.5"
			>
				<div class="flex items-start gap-3">
					<div class="min-w-0 flex-1 space-y-2">
						<div class="flex items-center gap-2">
							<div class="h-2 w-2 animate-pulse rounded-full bg-[var(--sl-bg-elevated)]"></div>
							<div class="h-4 w-32 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
						</div>
						<div class="h-3 w-24 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
					</div>
					<div class="h-7 w-7 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
				</div>

				<div class="mt-3 space-y-2 rounded-lg bg-[var(--sl-bg-elevated)]/50 px-3 py-2.5">
					{#each [1, 2, 3] as _, j (j)}
						<div class="flex items-center justify-between gap-3">
							<div class="h-3 w-14 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
							<div class="h-3 w-20 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
						</div>
					{/each}
				</div>
			</article>
		{/each}
	</div>
</div>
