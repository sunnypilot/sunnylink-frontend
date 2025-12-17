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

    let carPlatformBundle = $derived.by(() => {
        const val = deviceState.deviceValues[deviceId]?.CarPlatformBundle as { name: string, [key: string]: any } | null;
        if (!val) return null;
        // Check for empty object "{}"
        if (Object.keys(val).length === 0) return null;
        return val;
    });
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
                    query: { paramKeys: ['CarPlatformBundle', 'CarFingerprint', 'CarParamsPersistent'] }
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
                    } else if (item.key === 'CarParamsPersistent') {
                         // Attempts to extract carFingerprint from Cap'n Proto bytes
                         try {
                             const base64 = item.value;
                             if (base64) {
                                 const binary = atob(base64);
                                 // Simple heuristic: Car fingerprints are usually uppercase, alphanumeric, underscores, min length 4
                                 // e.g. HONDA_CIVIC, TOYOTA_RAV4_2022
                                 // We look for the longest contiguous string matching this pattern.
                                 const matches = binary.match(/[A-Z0-9_]{4,}/g);
                                 if (matches) {
                                     // Filter out likely noise (e.g. very short random matches)
                                     // Preference for strings containing underscores (common in openpilot fingerprints)
                                     // or just pick the longest one.
                                     const bestMatch = matches.sort((a, b) => b.length - a.length)[0];
                                     if (bestMatch) {
                                         console.log('Extracted fingerprint from CarParamsPersistent:', bestMatch);
                                         deviceState.deviceValues[deviceId]['CarFingerprint'] = bestMatch;
                                     }
                                 }
                             }
                         } catch (e) {
                             console.warn('Failed to parse CarParamsPersistent', e);
                         }
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
            
            // Refresh values in background / after closing modal
            confirmOpen = false;
            await fetchValues();
        } catch (e: any) {
            // If it's a timeout, the device likely received the command but response was slow.
            // We proceed to refresh values.
            if (e.message && e.message.includes('Timeout')) {
                console.warn('Timeout waiting for device response, but proceeding as command was likely sent.', e);
                // Swallow error and refresh
                await fetchValues();
                confirmOpen = false;
            } else {
                console.error('Failed to clear selection', e);
                alert(`Failed to clear selection: ${e.message}`);
            }
            isLoadingValues = false;
        } finally {
            isClearing = false;
        }
	}
    
    async function handleSelect(name: string, data: any) {
        if (!deviceId) return;
        try {
            const token = await logtoClient?.getIdToken();
            if (!token) throw new Error('Not authenticated');

            isLoadingValues = true; // Show loading immediately
            
            // Construct bundle, ensuring name is set and removing internal UI id if present
            const { id, ...rest } = data;
            const bundle = { ...rest, name };
            
            const bundleStr = JSON.stringify(bundle);
            
            // Encode the value using device utils
            const encodedValue = encodeParamValue({ key: 'CarPlatformBundle', value: bundleStr, type: 'Json' });

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
             // Handle timeout gracefully
             if (e.message && e.message.includes('Timeout')) {
                console.warn('Timeout waiting for device response during selection, assuming success.', e);
                await fetchValues();
                modalOpen = false;
            } else {
                console.error('Failed to set vehicle', e);
                alert(`Failed to set vehicle: ${e.message}`);
                isLoadingValues = false;
            }
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
