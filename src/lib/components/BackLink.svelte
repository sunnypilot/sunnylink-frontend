<script lang="ts">
	import { ChevronLeft } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { navHistory } from '$lib/stores/navHistory.svelte';

	interface Props {
		/** Destination label — the page the user will return to. Linear-style
		 *  breadcrumb ("Home"), not "Back to Home". */
		label: string;
		/** Either a URL to `goto()` or a function to run when the browser has
		 *  no in-app back entry to pop (deep-link entry, hard refresh). */
		fallback: string | (() => void);
		/** Extra utility classes merged onto the button (e.g. `mb-4`). */
		class?: string;
	}

	let { label, fallback, class: extraClass = '' }: Props = $props();

	function handleClick() {
		if (navHistory.hasInternalNav && typeof window !== 'undefined') {
			history.back();
			return;
		}
		if (typeof fallback === 'string') {
			goto(fallback);
		} else {
			fallback();
		}
	}
</script>

<button
	type="button"
	onclick={handleClick}
	class="row-press inline-flex items-center gap-1 rounded px-1 py-0.5 text-[0.8125rem] text-[var(--sl-text-3)] transition-all duration-100 hover:text-[var(--sl-text-1)] active:scale-[0.96] active:bg-[var(--sl-bg-elevated)] {extraClass}"
>
	<ChevronLeft size={14} aria-hidden="true" />
	{label}
</button>
