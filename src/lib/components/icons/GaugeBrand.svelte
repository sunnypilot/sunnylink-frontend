<script lang="ts">
	interface Props {
		size?: number | string;
		class?: string;
	}
	let { size = 24, class: className = '' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	<path d="M3.34 19a10 10 0 1 1 17.32 0" />
	<path d="m12 14 4-4" stroke="var(--color-primary)" stroke-width="2.75" />
</svg>
