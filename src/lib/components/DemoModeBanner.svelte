<script lang="ts">
	import { goto } from '$app/navigation';
	import { demoContext } from '$lib/demo/demoContext.svelte';
	import { deactivateDemoMode, resetDemoMode } from '$lib/demo/demoMode.svelte';
	import { RefreshCw, Rocket, XCircle } from 'lucide-svelte';

	let resetting = $state(false);

	const handleReset = async () => {
		resetting = true;
		await resetDemoMode();
		resetting = false;
	};

	const exitDemo = () => {
		deactivateDemoMode();
		goto('/');
	};
</script>

<div class="sticky top-0 z-[65] mb-4 border-b border-[#1e293b] bg-[#0a1424]/95 px-4 py-3 shadow-lg shadow-black/20 backdrop-blur sm:px-6">
	<div class="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-start gap-3">
			<div class="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
				<Rocket size={18} />
			</div>
			<div class="space-y-1">
				<p class="text-sm font-semibold text-white">Demo mode active</p>
				<p class="text-xs text-slate-400">
					You&apos;re exploring sunnylink with simulated devices. Data is temporary and kept in memory.
				</p>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				class="btn btn-xs rounded-lg border border-primary/30 bg-primary/10 text-primary hover:border-primary/60 hover:bg-primary/20"
				onclick={handleReset}
				disabled={resetting}
			>
				{#if resetting}
					<RefreshCw size={14} class="animate-spin" />
				{:else}
					<RefreshCw size={14} />
				{/if}
				Reset demo
			</button>
			{#if !demoContext.isActive}
				<!-- no-op to satisfy linting when banner briefly renders -->
			{:else}
				<button
					class="btn btn-xs rounded-lg border border-transparent bg-red-500/10 text-red-300 hover:border-red-500/40 hover:bg-red-500/20"
					onclick={exitDemo}
				>
					<XCircle size={14} />
					Exit demo
				</button>
			{/if}
		</div>
	</div>
</div>
