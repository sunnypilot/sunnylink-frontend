<script lang="ts">
	import { TONE_CLASSES, type Badge } from '$lib/utils/deviceBadges';

	interface Props {
		badge: Badge;
	}

	let { badge }: Props = $props();
</script>

<span
	class="inline-flex items-center rounded-full px-2 py-[2px] text-[0.6875rem] leading-none font-medium {TONE_CLASSES[
		badge.tone
	]}"
>
	{badge.label}
</span>
