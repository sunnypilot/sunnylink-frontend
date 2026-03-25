<script lang="ts">
	import { toastState } from '$lib/stores/toast.svelte';
	import { fly } from 'svelte/transition';
	import { Check, AlertTriangle, Info, WifiOff } from 'lucide-svelte';

	const typeClasses = {
		success:
			'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400',
		error: 'bg-red-50 dark:bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400',
		warning:
			'bg-amber-50 dark:bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400',
		info: 'bg-blue-50 dark:bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400'
	};

	let classes = $derived(typeClasses[toastState.type] ?? typeClasses.info);
</script>

{#if toastState.visible}
	<div
		role={toastState.type === 'error' ? 'alert' : 'status'}
		class="fixed right-4 bottom-4 z-[100] flex items-center gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur-md sm:right-6 sm:bottom-6 {classes}"
		transition:fly={{ y: 20, duration: 300 }}
	>
		{#if toastState.type === 'success'}
			<Check size={20} />
		{:else if toastState.type === 'error'}
			<AlertTriangle size={20} />
		{:else if toastState.type === 'warning'}
			<WifiOff size={20} />
		{:else}
			<Info size={20} />
		{/if}
		<span class="max-w-xs text-sm font-medium">{toastState.message}</span>
		{#if toastState.action}
			<button
				class="ml-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/10"
				onclick={() => {
					toastState.action?.onclick();
					toastState.visible = false;
				}}
			>
				{toastState.action.label}
			</button>
		{/if}
	</div>
{/if}
