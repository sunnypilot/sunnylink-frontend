<script lang="ts">
	import { Check } from 'lucide-svelte';

	let {
		mode,
		isOffroad,
		forceOffroad,
		isLoading = false
	} = $props<{
		mode: 'auto' | 'manual' | 'none';
		isOffroad?: boolean;
		forceOffroad?: boolean;
		isLoading?: boolean;
	}>();
</script>

<div class="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-4">
	<div class="mb-4">
		<h3 class="text-sm font-medium text-[var(--sl-text-2)]">
			{#if isLoading}
				<div class="h-5 w-3/4 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
			{:else}
				Select vehicle to force fingerprint manually.
			{/if}
		</h3>
		<p class="mt-1 text-xs text-[var(--sl-text-3)]">
			{#if isLoading}
				<div class="h-3 w-1/2 animate-pulse rounded bg-[var(--sl-bg-elevated)]"></div>
			{:else}
				Colors represent vehicle fingerprint status:
			{/if}
		</p>
	</div>

	<div class="space-y-3">
		{#if isLoading}
			{#each Array(3) as _}
				<div class="flex animate-pulse items-center gap-3">
					<div class="h-6 w-6 rounded bg-[var(--sl-bg-elevated)]"></div>
					<div class="h-4 w-32 rounded bg-[var(--sl-bg-elevated)]"></div>
				</div>
			{/each}
		{:else}
			<!-- Green: Auto -->
			<div class="flex items-center gap-3">
				<div
					class="h-6 w-6 rounded border border-emerald-500/50 bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
					class:opacity-100={mode === 'auto'}
					class:opacity-40={mode !== 'auto'}
				></div>
				<span
					class="text-sm"
					class:font-bold={mode === 'auto'}
					class:text-[var(--sl-text-1)]={mode === 'auto'}
					class:text-[var(--sl-text-2)]={mode !== 'auto'}
				>
					Fingerprinted in previous drive
				</span>
			</div>

			<!-- Blue: Manual -->
			<div class="flex items-center gap-3">
				<div
					class="h-6 w-6 rounded border border-blue-500/50 bg-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
					class:opacity-100={mode === 'manual'}
					class:opacity-40={mode !== 'manual'}
				></div>
				<span
					class="text-sm"
					class:font-bold={mode === 'manual'}
					class:text-[var(--sl-text-1)]={mode === 'manual'}
					class:text-[var(--sl-text-2)]={mode !== 'manual'}
				>
					Manually selected fingerprint
				</span>
			</div>

			<!-- Yellow: None -->
			<div class="flex items-center gap-3">
				<div
					class="h-6 w-6 rounded border border-yellow-500/50 bg-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.2)]"
					class:opacity-100={mode === 'none'}
					class:opacity-40={mode !== 'none'}
				></div>
				<span
					class="text-sm"
					class:font-bold={mode === 'none'}
					class:text-[var(--sl-text-1)]={mode === 'none'}
					class:text-[var(--sl-text-2)]={mode !== 'none'}
				>
					Not fingerprinted or manually selected
				</span>
			</div>
		{/if}
	</div>
</div>
