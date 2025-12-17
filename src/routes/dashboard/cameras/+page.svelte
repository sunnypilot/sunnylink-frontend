<script lang="ts">
	import { localDeviceState } from '$lib/stores/localDevice.svelte.ts';
	import { onMount, onDestroy } from 'svelte';
	import Hls from 'hls.js';
	import { Folder, Film, ArrowLeft, RefreshCw, AlertTriangle, MonitorPlay } from 'lucide-svelte';

    // State
	let currentPath = $state('/');
	let files = $state<any[]>([]);
	let loading = $state(false);
	let error = $state('');
    let selectedVideo = $state<string | null>(null);
    let hls: Hls | null = null;
    let videoElement: HTMLVideoElement;
    let isEditingIp = $state(false);
    let inputIp = $state('');

    // Derived
    let breadcrumbs = $derived(currentPath.split('/').filter(Boolean));

    onMount(() => {
        inputIp = localDeviceState.ip;
        if (localDeviceState.ip) {
            fetchFiles('/');
        } else {
            isEditingIp = true;
        }
    });

    onDestroy(() => {
        if (hls) {
            hls.destroy();
        }
    });

	async function fetchFiles(path: string) {
        if (!localDeviceState.ip) return;
        
		loading = true;
		error = '';
        currentPath = path; // Optimistic update

		try {
			const res = await fetch(`${localDeviceState.baseUrl}/api/files?path=${encodeURIComponent(path)}`);
            if (!res.ok) throw new Error(`Failed to connect: ${res.statusText}`);
			const data = await res.json();
            
            // Sort: Directories first, then files
            const sortedByDate = (a: any, b: any) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime();
            
            // The API returns already sorted lists but simpler to just use it.
            // But python script says: directories = sorted..., files = sorted... then items = directories + files
            files = data.files;
            currentPath = data.path ? '/' + data.path : '/';
            // Clean up path double slashes
            currentPath = currentPath.replace(/\/+/g, '/');

		} catch (e: any) {
			error = e.message;
            // Mixed content hint
            if (window.location.protocol === 'https:' && e.message.includes('Failed to fetch')) {
                 error += '. (Note: Ensure you are allowed to access HTTP resources from HTTPS, or use the PWA in a way that allows mixed content)';
            }
		} finally {
			loading = false;
		}
	}

    function handleIpSave() {
        localDeviceState.setIp(inputIp);
        isEditingIp = false;
        fetchFiles('/');
    }

    function playVideo(filePath: string) {
        selectedVideo = filePath;
        // Wait for DOM
        setTimeout(initPlayer, 0);
    }

    function closePlayer() {
        if (hls) {
            hls.destroy();
            hls = null;
        }
        selectedVideo = null;
    }

    function initPlayer() {
        if (!videoElement || !selectedVideo) return;
        
        const videoSrc = `${localDeviceState.baseUrl}/api/manifest.m3u8?file=${encodeURIComponent(selectedVideo)}`;

        if (Hls.isSupported()) {
            hls = new Hls({
                 debug: false,
                 enableWorker: true,
                 lowLatencyMode: true,
            });
            hls.loadSource(videoSrc);
            hls.attachMedia(videoElement);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                videoElement.play();
            });
            hls.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) {
                    switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.error("fatal network error encountered, try to recover");
                        hls?.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.error("fatal media error encountered, try to recover");
                        hls?.recoverMediaError();
                        break;
                    default:
                        // cannot recover
                        hls?.destroy();
                        break;
                    }
                }
            });
        }
        else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            videoElement.src = videoSrc;
            videoElement.addEventListener('loadedmetadata', function() {
                videoElement.play();
            });
        }
    }

    function navigateUp() {
        const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
        fetchFiles(parent);
    }
</script>

<div class="flex flex-col gap-6">
    <!-- Header / Config -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
            <h1 class="text-2xl font-bold text-white">Local Cameras</h1>
            <p class="text-sm text-slate-400">Browse and stream from your local comma device</p>
        </div>
        
        {#if !isEditingIp && localDeviceState.ip}
             <div class="flex items-center gap-2 rounded-lg border border-[#334155] bg-[#1e293b] px-3 py-2">
                <div class="flex items-center gap-2 text-sm text-slate-300">
                    <MonitorPlay size={16} class="text-emerald-400" />
                    <span>{localDeviceState.ip}</span>
                </div>
                <button class="btn btn-ghost btn-xs text-slate-400 hover:text-white" onclick={() => isEditingIp = true}>
                    Edit
                </button>
             </div>
        {/if}
    </div>

    {#if isEditingIp || !localDeviceState.ip}
        <div class="card w-full max-w-lg border border-[#334155] bg-[#1e293b] p-6">
            <h3 class="mb-4 text-lg font-semibold text-white">Device Connection</h3>
            <div class="form-control w-full">
                <label class="label">
                    <span class="label-text text-slate-400">Device LAN IP Address</span>
                </label>
                <div class="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="e.g. 192.168.1.15" 
                        class="input input-bordered w-full bg-[#0f1726] text-white" 
                        bind:value={inputIp}
                    />
                    <button class="btn btn-primary" onclick={handleIpSave}>Connect</button>
                </div>
                <label class="label">
                    <span class="label-text-alt text-slate-500">Ensure your device is on the same Wi-Fi network. Default port 5088 is used.</span>
                </label>
            </div>
        </div>
    {:else}
        <!-- File Browser -->
        <div class="rounded-xl border border-[#334155] bg-[#1e293b] overflow-hidden">
            <!-- Toolbar -->
            <div class="flex items-center gap-2 border-b border-[#334155] px-4 py-3 bg-[#0f1726]/50">
                <button class="btn btn-ghost btn-sm btn-square text-slate-400" onclick={() => fetchFiles(currentPath)} disabled={loading}>
                     <RefreshCw size={16} class={loading ? "animate-spin" : ""} />
                </button>
                {#if currentPath !== '/'}
                    <button class="btn btn-ghost btn-sm btn-square text-slate-400" onclick={navigateUp}>
                        <ArrowLeft size={18} />
                    </button>
                {/if}
                <div class="flex items-center gap-1 text-sm text-slate-400 overflow-x-auto px-2 font-mono">
                    <button class="hover:text-white hover:underline" onclick={() => fetchFiles('/')}>root</button>
                    {#each breadcrumbs as crumb, i}
                        <span>/</span>
                         <button class="hover:text-white hover:underline" onclick={() => {
                             const path = '/' + breadcrumbs.slice(0, i + 1).join('/');
                             fetchFiles(path);
                         }}>{crumb}</button>
                    {/each}
                </div>
            </div>

            <!-- Error -->
            {#if error}
                <div class="flex items-center gap-3 bg-red-500/10 p-4 text-red-500">
                    <AlertTriangle size={20} />
                    <p class="text-sm font-medium">{error}</p>
                </div>
            {/if}

            <!-- List -->
             {#if !error}
            <div class="overflow-x-auto">
                <table class="table w-full text-left text-sm">
                    <thead>
                        <tr class="border-b border-[#334155] text-slate-400">
                            <th class="bg-transparent pl-6 w-12"></th>
                            <th class="bg-transparent">Name</th>
                            <th class="bg-transparent text-right">Size</th>
                            <th class="bg-transparent text-right pr-6">Date</th>
                        </tr>
                    </thead>
                    <tbody class="text-slate-300">
                        {#if files.length === 0 && !loading}
                            <tr>
                                <td colspan="4" class="py-8 text-center text-slate-500">No files found</td>
                            </tr>
                        {/if}
                        {#each files as file}
                            <tr class="group hover:bg-[#334155]/30 cursor-pointer border-b border-[#334155]/30 last:border-0 transition-colors"
                                onclick={() => {
                                    if (file.is_dir) {
                                        fetchFiles((currentPath === '/' ? '' : currentPath) + '/' + file.name);
                                    } else if (file.name.endsWith('.ts') || file.name.endsWith('.mp4') || file.name.endsWith('.mkv')) {
                                          // Construct full path
                                          const fullPath = (currentPath === '/' ? '' : currentPath) + '/' + file.name;
                                          playVideo(fullPath);
                                    }
                                }}
                            >
                                <td class="pl-6 text-slate-400">
                                    {#if file.is_dir}
                                        <Folder size={18} class="text-blue-400" />
                                    {:else}
                                        <Film size={18} class="text-slate-500 group-hover:text-emerald-400" />
                                    {/if}
                                </td>
                                <td class="font-medium group-hover:text-white">
                                    {file.name}
                                </td>
                                <td class="text-right font-mono text-xs text-slate-500">
                                    {file.is_dir ? '-' : (file.size / 1024 / 1024).toFixed(2) + ' MB'}
                                </td>
                                <td class="text-right text-xs text-slate-500 font-mono pr-6">
                                    {file.mtime}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            {/if}
        </div>
    {/if}
</div>

<!-- Player Modal -->
{#if selectedVideo}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
        <div class="w-full max-w-5xl overflow-hidden rounded-2xl bg-[#0f1726] shadow-2xl ring-1 ring-[#334155]">
            <div class="flex items-center justify-between border-b border-[#334155] px-4 py-3">
                <h3 class="font-medium text-white truncate px-2">{selectedVideo.split('/').pop()}</h3>
                <button class="btn btn-ghost btn-sm btn-square text-slate-400 hover:text-white" onclick={closePlayer}>
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div class="relative aspect-video w-full bg-black">
                <!-- svelte-ignore a11y_media_has_caption -->
                <video 
                    bind:this={videoElement}
                    class="h-full w-full" 
                    controls 
                    autoplay
                ></video>
            </div>
        </div>
    </div>
{/if}
