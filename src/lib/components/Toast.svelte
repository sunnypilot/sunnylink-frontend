<script lang="ts">
	import { toastState } from '$lib/stores/toast.svelte';
	import { fly } from 'svelte/transition';
	import { Check, AlertTriangle, Info, WifiOff } from 'lucide-svelte';

	const colorMap = {
		success: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', text: '#34d399' },
		error: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', text: '#f87171' },
		warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
		info: { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', text: '#60a5fa' }
	};

	let colors = $derived(colorMap[toastState.type] ?? colorMap.info);
</script>

{#if toastState.visible}
	<div
		role={toastState.type === 'error' ? 'alert' : 'status'}
		class="fixed right-4 bottom-4 z-[100] flex items-center gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur-md sm:right-6 sm:bottom-6"
		style="background-color: {colors.bg}; border-color: {colors.border}; color: {colors.text}"
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
				class="ml-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-white/10"
				style="color: {colors.text}"
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
