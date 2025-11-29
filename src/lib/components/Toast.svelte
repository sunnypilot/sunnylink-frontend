<script lang="ts">
	import { toastState } from '$lib/stores/toast.svelte';
	import { fade, fly } from 'svelte/transition';
	import { Check, AlertTriangle, Info } from 'lucide-svelte';
</script>

{#if toastState.visible}
	<div
		class="fixed right-6 bottom-6 z-[100] flex items-center gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur-md transition-all"
		class:bg-emerald-500-10={toastState.type === 'success'}
		class:border-emerald-500-20={toastState.type === 'success'}
		class:text-emerald-400={toastState.type === 'success'}
		class:bg-red-500-10={toastState.type === 'error'}
		class:border-red-500-20={toastState.type === 'error'}
		class:text-red-400={toastState.type === 'error'}
		class:bg-blue-500-10={toastState.type === 'info'}
		class:border-blue-500-20={toastState.type === 'info'}
		class:text-blue-400={toastState.type === 'info'}
		style="background-color: {toastState.type === 'success'
			? 'rgba(16, 185, 129, 0.1)'
			: toastState.type === 'error'
				? 'rgba(239, 68, 68, 0.1)'
				: 'rgba(59, 130, 246, 0.1)'}; border-color: {toastState.type === 'success'
			? 'rgba(16, 185, 129, 0.2)'
			: toastState.type === 'error'
				? 'rgba(239, 68, 68, 0.2)'
				: 'rgba(59, 130, 246, 0.2)'}; color: {toastState.type === 'success'
			? '#34d399'
			: toastState.type === 'error'
				? '#f87171'
				: '#60a5fa'}"
		transition:fly={{ y: 20, duration: 300 }}
	>
		{#if toastState.type === 'success'}
			<Check size={20} />
		{:else if toastState.type === 'error'}
			<AlertTriangle size={20} />
		{:else}
			<Info size={20} />
		{/if}
		<span class="font-medium">{toastState.message}</span>
	</div>
{/if}
