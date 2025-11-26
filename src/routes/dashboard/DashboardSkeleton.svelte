<script lang="ts">
	let { name } = $props<{ name?: string }>();
</script>

<div class="animate-pulse space-y-4 sm:space-y-6 lg:space-y-8">
	<div class="card border border-[#1e293b] bg-[#0f1726]">
		<div class="card-body p-4 sm:p-6 lg:p-8">
			{#if name}
				<div
					class="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8"
				>
					<div class="max-w-2xl space-y-3 sm:space-y-4">
						<p class="text-xs tracking-[0.3em] text-slate-400 uppercase">Daily sunnypilot</p>
						<h1 class="text-2xl font-bold text-white sm:text-3xl md:text-4xl lg:text-5xl">
							Hi {name}!
						</h1>
						<p class="text-lg text-slate-300 sm:text-xl">Loading your devices...</p>
					</div>
				</div>
			{:else}
				<div class="flex flex-col gap-4">
					<div class="h-4 w-32 rounded bg-slate-700"></div>
					<div class="h-10 w-64 rounded bg-slate-700"></div>
					<div class="h-6 w-96 rounded bg-slate-700"></div>
					<div class="h-4 w-full max-w-lg rounded bg-slate-700"></div>
				</div>
			{/if}
		</div>
	</div>

	<div class="card mt-2 border border-[#1e293b] bg-[#0f1726]">
		<div class="card-body p-4 sm:p-6 lg:p-8">
			<div class="grid gap-6 sm:gap-8 lg:grid-cols-[1.6fr_1fr]">
				<div class="space-y-4 sm:space-y-6">
					<div class="form-control w-full">
						<div class="mb-2 h-4 w-24 rounded bg-slate-700"></div>
						<div class="h-12 w-full rounded bg-slate-700"></div>
					</div>
					<div class="form-control w-full">
						<div class="mb-2 h-4 w-24 rounded bg-slate-700"></div>
						<div class="h-12 w-full rounded bg-slate-700"></div>
					</div>
				</div>
				<div class="card border border-[#1e293b] bg-[#0f1726]">
					<div class="card-body space-y-4 p-4 sm:p-6">
						<div class="h-4 w-32 rounded bg-slate-700"></div>
						<div class="h-8 w-48 rounded bg-slate-700"></div>
						<div class="h-4 w-40 rounded bg-slate-700"></div>
						<div class="mt-4 space-y-2">
							<div class="h-4 w-full rounded bg-slate-700"></div>
							<div class="h-4 w-full rounded bg-slate-700"></div>
						</div>
					</div>
				</div>
			</div>
			<div class="mt-6 sm:mt-8">
				<div class="h-12 w-full rounded bg-slate-700"></div>
			</div>
		</div>
	</div>
</div>
