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
	<rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
	<path d="M12 18h.01" stroke="var(--color-primary)" stroke-width="3" />
</svg>
