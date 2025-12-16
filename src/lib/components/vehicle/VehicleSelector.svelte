<script lang="ts">
	import { onMount } from 'svelte';
	import { deviceState } from '$lib/stores/device.svelte';
	import { getCarList, setDeviceParams } from '$lib/api/device';
	import { v1Client } from '$lib/api/client';
	import { logtoClient } from '$lib/logto/auth.svelte';
	import { decodeParamValue, encodeParamValue } from '$lib/utils/device';
    
	import PlatformSelector from './PlatformSelector.svelte';
	import LegendWidget from './LegendWidget.svelte';
	import CarSelectionModal from './CarSelectionModal.svelte';
	import VehicleMetadata from './VehicleMetadata.svelte';
    import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';

	let { deviceId } = $props<{ deviceId: string }>();

	let carList = $state<Record<string, any> | null>(null);
	let isFetchingCarList = $state(false);
	let modalOpen = $state(false);

    // Confirmation Modal State
    let confirmOpen = $state(false);
    let isClearing = $state(false);

    let carPlatformBundle = $derived(deviceState.deviceValues[deviceId]?.CarPlatformBundle as { name: string, [key: string]: any } | null);
    // let carPlatformBundle = $derived({ name: "TEST VEHICLE", make: "Test", model: "Car", year: "2024" });
    let carFingerprint = $derived(deviceState.deviceValues[deviceId]?.CarFingerprint as string || '');

    // Loading state: If device is online but values are missing/empty, we might be loading.
    let isLoadingValues = $state(true);

    async function fetchValues() {
        if (!deviceId || !logtoClient) return;
        const token = await logtoClient.getIdToken();
        if (!token) return;

        isLoadingValues = true;
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
        } finally {
            isLoadingValues = false;
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

    function requestClear() {
        confirmOpen = true;
    }

	async function handleClearConfirm() {
        if (!deviceId) return;
        isClearing = true;
        try {
            const token = await logtoClient?.getIdToken();
            if (!token) throw new Error('Not authenticated');
            
            isLoadingValues = true; // Show loading during clear
            
            console.log('Clearing CarPlatformBundle with empty JSON...');

            // Encode an empty JSON object to clear it
            const encodedValue = encodeParamValue({ key: 'CarPlatformBundle', value: '{}', type: 'Json' });

            const res = await setDeviceParams(deviceId, [{ 
                key: 'CarPlatformBundle', 
                value: String(encodedValue), 
                is_compressed: false 
            }], token);
            
            if (res.error) {
                throw new Error(res.error.detail || res.error.message || 'Unknown API error');
            }
            
            // Refresh values
            await fetchValues();
            confirmOpen = false;
        } catch (e: any) {
            console.error('Failed to clear selection', e);
            alert(`Failed to clear selection: ${e.message}`);
            isLoadingValues = false;
        } finally {
            isClearing = false;
        }
	}
    
    async function handleSelect(bundle: CarPlatformBundle) {
        if (!deviceId) return;
        try {
            const token = await logtoClient?.getIdToken();
            if (!token) throw new Error('Not authenticated');
            
            isLoadingValues = true; // Show loading immediately
            const bundleStr = JSON.stringify(bundle);
            
            // Encode the value using device utils
            const encodedValue = encodeParamValue({ key: 'CarPlatformBundle', value: bundleStr, type: 'String' });

            const res = await setDeviceParams(deviceId, [{ 
                key: 'CarPlatformBundle', 
                value: String(encodedValue),
                is_compressed: false
            }], token);
            
            if (res.error) {
                throw new Error(res.error.detail || res.error.message || 'Unknown API error');
            }
            
            // Refresh values
            await fetchValues();
            modalOpen = false;
        } catch (e: any) {
            console.error('Failed to set vehicle', e);
            alert(`Failed to set vehicle: ${e.message}`);
            isLoadingValues = false;
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
            isLoading={isLoadingValues}
            onSelect={handleOpen}
            onRemove={requestClear}
        />
        <LegendWidget mode={mode} isLoading={isLoadingValues} />
    </div>

    <!-- Right Column: Metadata -->
    <div>
        <VehicleMetadata bundle={carPlatformBundle} isLoading={isLoadingValues} />
    </div>
    
    <CarSelectionModal 
        bind:open={modalOpen}
        carList={carList}
        onSelect={handleSelect}
    />

    <ConfirmationModal
        bind:open={confirmOpen}
        title="Remove Manual Selection"
        message="Are you sure you want to remove the manual vehicle selection? This will revert the device to automatic fingerprinting."
        confirmText="Remove"
        variant="danger"
        isProcessing={isClearing}
        onConfirm={handleClearConfirm}
    />
</div>
