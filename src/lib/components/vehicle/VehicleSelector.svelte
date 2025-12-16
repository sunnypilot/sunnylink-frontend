<script lang="ts">
	import { onMount } from 'svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { getCarList, setDeviceParams } from '$lib/api/device';
	import { v1Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { decodeParamValue } from '$lib/utils/device';
    
	import PlatformSelector from './PlatformSelector.svelte';
	import LegendWidget from './LegendWidget.svelte';
	import CarSelectionModal from './CarSelectionModal.svelte';
	import VehicleMetadata from './VehicleMetadata.svelte';

	let { deviceId } = $props<{ deviceId: string }>();

	let carList = $state<Record<string, any> | null>(null);
	let isFetchingCarList = $state(false);
	let modalOpen = $state(false);

    let carPlatformBundle = $derived(deviceState.deviceValues[deviceId]?.CarPlatformBundle as { name: string, [key: string]: any } | null);
    let carFingerprint = $derived(deviceState.deviceValues[deviceId]?.CarFingerprint as string || '');

    async function fetchValues() {
        if (!deviceId || !logtoClient) return;
        const token = await logtoClient.getIdToken();
        if (!token) return;

        try {
            const res = await v1Client.GET('/v1/settings/{deviceId}/values', {
                params: {
                    path: { deviceId },
                    query: { paramKeys: ['CarPlatformBundle', 'CarFingerprint'] }
                },
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.data?.items) {
                if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
                
                for (const item of res.data.items) {
                    if (item.key === 'CarPlatformBundle') {
                         const val = decodeParamValue(item);
                         try {
                             deviceState.deviceValues[deviceId]['CarPlatformBundle'] = typeof val === 'string' ? JSON.parse(val) : val;
                         } catch (e) {
                             console.warn('Failed to parse CarPlatformBundle', e);
                         }
                    } else if (item.key === 'CarFingerprint') {
                         deviceState.deviceValues[deviceId]['CarFingerprint'] = decodeParamValue(item);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch vehicle params', e);
        }
    }

    onMount(() => {
        fetchValues();
    });

	async function handleOpen() {
		modalOpen = true;
		if (!carList && !isFetchingCarList) {
			isFetchingCarList = true;
			try {
				const token = await logtoClient?.getIdToken();
				if (token) {
					const list = await getCarList(deviceId, token);
					if (list) {
						carList = list;
					} else {
                        console.warn('No CarList found on device');
                    }
				}
			} finally {
				isFetchingCarList = false;
			}
		}
	}

	async function handleClear() {
		if (confirm('Are you sure you want to remove the manual fingerprint selection?')) {
			try {
                const token = await logtoClient?.getIdToken();
                if (!token) return;
                
                await setDeviceParams(deviceId, [{ key: 'CarPlatformBundle', value: '' }], token);
                
                // Refresh values
                await fetchValues();
            } catch (e) {
                console.error('Failed to clear fingerprint', e);
                alert('Failed to clear fingerprint');
            }
		}
	}
    
    async function handleSelect(platform: string, data: any) {
        const bundle = { ...data, name: platform };
        
        try {
            const token = await logtoClient?.getIdToken();
            if (!token) return;
            
            await setDeviceParams(deviceId, [{ key: 'CarPlatformBundle', value: JSON.stringify(bundle) }], token);
            
            // Refresh values
            await fetchValues();
        } catch (e) {
            console.error('Failed to set vehicle', e);
            alert('Failed to set vehicle');
        }
    }

    let isMock = $derived(carFingerprint === 'MOCK' || !carFingerprint);
    let mode = $derived.by(() => {
        if (carPlatformBundle) return 'manual';
        if (!isMock) return 'auto';
        return 'none';
    });

</script>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <!-- Left Column: Selector & Status -->
    <div class="space-y-4">
        <PlatformSelector
            manualBundle={carPlatformBundle}
            autoFingerprint={carFingerprint}
            onClick={() => (carPlatformBundle ? handleClear() : handleOpen())}
        />
        <LegendWidget mode={mode} />
    </div>

    <!-- Right Column: Metadata -->
    <div>
        <VehicleMetadata bundle={carPlatformBundle} />
    </div>
    
    <CarSelectionModal 
        bind:open={modalOpen}
        carList={carList}
        onSelect={handleSelect}
    />
</div>
