<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { logtoClient } from '$lib/logto/auth';
	import type { UserInfoResponse } from '@logto/browser';

	const auth = $state({
		loading: true,
		isAuthenticated: false,
		profile: undefined as UserInfoResponse | undefined
	});

	onMount(async () => {
		if (!logtoClient) return;
		auth.isAuthenticated = await logtoClient.isAuthenticated();
		if (!auth.isAuthenticated) {
			goto('/');
			return;
		}
		auth.profile = await logtoClient.fetchUserInfo();
		auth.loading = false;
	});
</script>

{#if auth.loading}
	<div class="grid min-h-[60vh] place-content-center text-slate-400">
		<p>Loading your workspace…</p>
	</div>
{:else}
	<div class="space-y-12">
		<section class="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
			<div class="max-w-xl space-y-4">
				<p class="text-sm tracking-[0.35em] text-slate-400/80 uppercase">Daily sunnypilot</p>
				<h1 class="text-4xl leading-tight font-semibold text-white md:text-5xl">
					Hi {auth.profile?.name || 'there'}, here’s your latest sunnypilot snapshot
				</h1>
				<p class="text-base text-slate-400/90">
					Dive in to see new routes, backups, and model insights. Everything you need, all in one
					place.
				</p>
			</div>

			<div class="flex flex-col items-center gap-4">
				<div
					class="flex h-36 w-36 items-center justify-center rounded-full border-[6px] border-white/10 bg-gradient-to-br from-[#131d32] to-[#0a0f1f] shadow-[0_30px_55px_-35px_rgba(4,10,24,0.8)]"
				>
					{#if auth.profile?.picture}
						<img
							src={auth.profile.picture}
							alt={auth.profile?.name || ''}
							class="h-full w-full rounded-full object-cover"
						/>
					{:else}
						<span class="text-5xl text-white">🤖</span>
					{/if}
				</div>
				<div
					class="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-slate-200 shadow"
				>
					<span class="font-semibold text-white/90"> Current Weather: ☀️ • 65°F</span>
				</div>
			</div>
		</section>

		<section
			class="rounded-[24px] border border-white/5 bg-white/6 p-6 shadow-[0_30px_70px_-60px_rgba(7,13,28,0.85)]"
		>
			<div class="mb-4 flex justify-between">
				<div class="w-full">
					<p class="text-lg font-semibold">Models</p>

					<fieldset class="fieldset">
						<legend class="fieldset-legend text-white">Select a model</legend>
						<select class="select bg-white/10 text-white">
							<option disabled selected>Select a model</option>
							<option>Sunnypilot v1</option>
							<option>Sunnypilot v2</option>
							<option>Sunnypilot v3</option>
						</select>
					</fieldset>
				</div>
				<div>
					<p class="text-lg font-semibold">Current Model</p>
					<p>Sunnypilot v1</p>
				</div>
			</div>
			<button class="btn w-full btn-soft btn-primary">Send to device 🚀</button>
		</section>
		<div class="grid grid-cols-3 gap-4">
			<section
				class="rounded-[24px] border border-white/5 bg-white/6 p-6 shadow-[0_30px_70px_-60px_rgba(7,13,28,0.85)]"
			>
				<div class="stats stats-vertical shadow lg:stats-horizontal">
					<div class="stat">
						<div class="stat-title text-white">Routes</div>
						<div class="stat-value text-white">5,592</div>
						<div class="stat-desc text-green-500">+400 (22%)</div>
					</div>
				</div>
			</section>
			<section
				class="rounded-[24px] border border-white/5 bg-white/6 p-6 shadow-[0_30px_70px_-60px_rgba(7,13,28,0.85)]"
			>
				<div class="stats stats-vertical shadow lg:stats-horizontal">
					<div class="stat">
						<div class="stat-title text-white">Minutes</div>
						<div class="stat-value text-white">10,240</div>
						<div class="stat-desc text-green-500">+1,200 (12%)</div>
					</div>
				</div>
			</section>
			<section
				class="rounded-[24px] border border-white/5 bg-white/6 p-6 shadow-[0_30px_70px_-60px_rgba(7,13,28,0.85)]"
			>
				<div class="stats stats-vertical shadow lg:stats-horizontal">
					<div class="stat">
						<div class="stat-title text-white">Miles</div>
						<div class="stat-value text-white">1,240</div>
						<div class="stat-desc text-red-500">-240 (20%)</div>
					</div>
				</div>
			</section>
		</div>
	</div>
{/if}
