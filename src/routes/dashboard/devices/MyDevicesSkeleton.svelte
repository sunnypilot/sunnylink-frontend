<script lang="ts">
	let { count = 4 }: { count?: number } = $props();
	const placeholders = Array.from({ length: count });
</script>

<div class="mx-auto w-full max-w-2xl pb-24 xl:max-w-3xl">
	<div class="mb-6 flex items-end justify-between gap-3 px-4">
		<div class="space-y-2">
			<div class="h-6 w-32 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
			<div class="h-3 w-20 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
		</div>
		<div class="h-7 w-7 animate-pulse rounded-md bg-[var(--sl-bg-elevated)]"></div>
	</div>

	<div class="flex flex-col gap-3" aria-hidden="true">
		{#each placeholders as _, i (i)}
			<article
				class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-4 py-3.5"
			>
				<div class="flex items-center gap-3">
					<div
						class="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[var(--sl-bg-elevated)]"
					></div>
					<div class="min-w-0 flex-1 space-y-1.5">
						<div class="h-3.5 w-28 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
						<div class="h-2.5 w-36 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
					</div>
				</div>
			</article>
		{/each}
	</div>
</div>
