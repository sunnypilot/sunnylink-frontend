<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { localDeviceState } from '$lib/stores/localDevice.svelte.ts';
	import { AugmentedRoadView } from '$lib/sunnylive/AugmentedRoadView';
	import { Play, Pause, AlertTriangle, VideoOff } from 'lucide-svelte';

	let canvas: HTMLCanvasElement;
	let video: HTMLVideoElement;
	let pc: RTCPeerConnection | null = null;
    let view: AugmentedRoadView | null = null;
    let dataChannel: RTCDataChannel | null = null;
    
    // State
    let isConnected = $state(false);
    let error = $state('');
    let loading = $state(false);
    let frameId: number;
    let hasVideo = $state(false);
    
    // Explicit type to avoid implicit any errors
    interface State {
        modelV2: any;
        liveCalibration: any;
        selfdriveState: any;
        radarState: any;
        deviceState: any;
        carState: any;
        controlsState: any;
        updated: Record<string, boolean>;
        valid: Record<string, boolean>;
        recv_frame: Record<string, number>;
    }

    let state: State = $state({
        modelV2: null,
        liveCalibration: null,
        selfdriveState: null,
        radarState: null,
        deviceState: null,
        carState: null,
        controlsState: null,
        updated: {},
        valid: {},
        recv_frame: {}
    });

    let debugTick = $state(0);
    setInterval(() => debugTick++, 1000); // Force UI refresh for debug timestamps

	onMount(() => {
        if (!localDeviceState.ip) {
            error = "No device IP configured. Please go to Settings to set the IP.";
            return;
        }
        startWebRTC();
	});

	onDestroy(() => {
        stopWebRTC();
        if (frameId) cancelAnimationFrame(frameId);
	});

    async function startWebRTC() {
        if (!localDeviceState.ip) return;
        loading = true;
        error = '';
        
        try {
            pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            // Handle potential errors with the connection
            pc.onconnectionstatechange = () => {
                if (pc?.connectionState === 'failed' || pc?.connectionState === 'closed') {
                     isConnected = false;
                     hasVideo = false;
                     // Optional: auto-reconnect logic
                }
                if (pc?.connectionState === 'connected') {
                    isConnected = true;
                    loading = false;
                }
            };
            
            // Data Channel for state
            dataChannel = pc.createDataChannel('data');
            setupDataChannel(dataChannel);
            
            // Video Track
            pc.ontrack = (evt) => {
                if (evt.track.kind === 'video' && evt.streams[0]) {
                     video.srcObject = evt.streams[0];
                     hasVideo = true;
                     initRenderer();
                }
            };
            
            // Transceiver for video
            pc.addTransceiver('video', { direction: 'recvonly' });

            // Offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Send to backend (Port 5001)
            const res = await fetch(`http://${localDeviceState.ip}:5001/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sdp: pc.localDescription?.sdp,
                    cameras: ['road'],
                })
            });

            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            
            const answer = await res.json();
            await pc.setRemoteDescription(new RTCSessionDescription(answer));

        } catch (e: any) {
            console.error(e);
            error = e.message;
            
            const isMixedContent = window.location.protocol === 'https:';
            const isNetworkError = e.message.toLowerCase().includes('failed to fetch') || 
                                 e.message.toLowerCase().includes('load failed') ||
                                 e.message.toLowerCase().includes('networkerror');

            if (isNetworkError) {
                if (isMixedContent) {
                    error = "Mixed Content Error: Cannot connect to HTTP device from HTTPS PWA. Please try accessing the app via HTTP or check if your device is blocking the connection.";
                } else {
                    error = "Network Error: Unable to reach device. Ensure phone and device are on the same Wi-Fi and the IP is correct.";
                }
            }
            loading = false;
        }
    }
    
    function stopWebRTC() {
        if (pc) {
            pc.close();
            pc = null;
        }
        isConnected = false;
        hasVideo = false;
    }

    function setupDataChannel(dc: RTCDataChannel) {
        dc.onmessage = (msg) => {
             try {
                // app.js handles "}{" split, simplified here assuming per-message
                // but real cereal stream might batch.
                const json = JSON.parse(msg.data);
                handleStateUpdate(json);
             } catch (e) {
                 // ignore partial json
             }
        };
    }
    
    function handleStateUpdate(msg: any) {
        const type = msg.type;
        const data = msg.data;
        if (!type || !data) return;
        
        state[type] = data;
        state.updated[type] = true;
        state.valid[type] = true;
        if (!state.recv_frame[type]) state.recv_frame[type] = 0;
        state.recv_frame[type]++;
        
        // Basic merge of other states managed by app.js (like frames) can be added here
    }

    function initRenderer() {
        if (!video || !canvas) return;
        view = new AugmentedRoadView();
        
        const renderLoop = () => {
             if (!canvas || !video) return;
             
             // Match canvas size to video or container
             const rect = video.getBoundingClientRect();
             if (canvas.width !== rect.width || canvas.height !== rect.height) {
                 canvas.width = rect.width;
                 canvas.height = rect.height;
             }
             
             const ctx = canvas.getContext('2d');
             if (ctx && view) {
                 ctx.clearRect(0, 0, canvas.width, canvas.height);
                 
                 // If HUD mode enabled in future settings, we could flip/transform here
                 
                 // Render AR
                 view.render({ x: 0, y: 0, width: canvas.width, height: canvas.height }, state, ctx, false); // false = imperial default
                 
                 // clear updated flags
                 // Object.keys(state.updated).forEach(k => state.updated[k] = false);
             }
             
             frameId = requestAnimationFrame(renderLoop);
        };
        frameId = requestAnimationFrame(renderLoop);
    }
</script>

<div class="flex flex-col h-[calc(100vh-4rem)] bg-black overflow-hidden relative">
    {#if error}
        <div class="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
             <div class="bg-red-500/10 p-6 rounded-xl border border-red-500/20 text-center max-w-md">
                 <AlertTriangle size={48} class="mx-auto text-red-500 mb-4" />
                 <h3 class="text-xl font-bold text-white mb-2">Connection Failed</h3>
                 <p class="text-red-300">{error}</p>
                 <button class="btn btn-outline btn-error mt-4" onclick={startWebRTC}>Retry</button>
             </div>
        </div>
    {/if}

    {#if loading}
        <div class="absolute inset-0 flex items-center justify-center z-40">
             <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>
    {/if}

    <!-- Video Layer -->
    <!-- svelte-ignore a11y_media_has_caption -->
    <video 
        bind:this={video}
        autoplay 
        playsinline
        muted
        class="absolute inset-0 w-full h-full object-contain bg-black"
    ></video>
    
    <!-- Canvas HUD Layer -->
    <canvas 
        bind:this={canvas}
        class="absolute inset-0 w-full h-full pointer-events-none"
    ></canvas>
    
    {#if !hasVideo && !loading && !error}
         <div class="absolute inset-0 flex items-center justify-center text-slate-500 flex-col gap-2">
             <VideoOff size={48} />
             <p>Waiting for video stream...</p>
         </div>
    {/if}
    
    <!-- Controls Overlay (Simple) -->
    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-auto z-30">
        <button class="btn btn-circle bg-black/50 border-white/20 hover:bg-black/70 text-white" onclick={() => isConnected ? stopWebRTC() : startWebRTC()}>
             {#if isConnected}
                 <Pause size={24} />
             {:else}
                 <Play size={24} />
             {/if}
        </button>
    </div>

    <!-- Debug Overlay -->
    <div class="absolute top-4 left-4 bg-black/50 text-xs text-white p-2 rounded pointer-events-none z-50 font-mono">
        <div>Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
        <div>Video: {hasVideo ? 'Yes' : 'No'} | {video?.videoWidth}x{video?.videoHeight}</div>
        <div class="mt-2 text-gray-400">Services (Count):</div>
        <div class={state.valid.carState ? 'text-green-400' : 'text-red-400'}>carState: {state.recv_frame.carState || 0}</div>
        <div class={state.valid.modelV2 ? 'text-green-400' : 'text-red-400'}>modelV2: {state.recv_frame.modelV2 || 0}</div>
        <div class={state.valid.liveCalibration ? 'text-green-400' : 'text-red-400'}>liveCalib: {state.recv_frame.liveCalibration || 0}</div>
        <div class={state.valid.controlsState ? 'text-green-400' : 'text-red-400'}>controls: {state.recv_frame.controlsState || 0}</div>
    </div>
</div>
