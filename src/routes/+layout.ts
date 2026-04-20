import { APIv1Client, APIv0Client } from '$lib/api/client';
import { logtoClient, getIdToken, authState } from '$lib/logto/auth.svelte';
import type { LayoutLoad } from './$types';
import type { DeviceAuthResponseModel } from '../sunnylink/types';

export type DeviceFetchError = 'auth_expired' | 'api_error' | null;
export type DeviceFetchResult = {
	/** Detail records that have been fully hydrated. On root navigation this is
	 *  just the selected device; on /dashboard/devices the page hydrates the rest. */
	devices: DeviceAuthResponseModel[];
	/** Lightweight list items for every paired device. Used by switchers and
	 *  routes that only need device_id / created_at / token_hash. */
	pairedList: { device_id?: string; created_at?: string | number; updated_at?: string | number }[];
	error: DeviceFetchError;
};

export const load: LayoutLoad = async ({ depends }) => {
	// Only re-run this load when explicitly invalidated via invalidate('app:devices').
	// IMPORTANT: Do NOT access `url` here — SvelteKit treats it as a dependency and
	// re-runs the load on every route change, causing redundant device list fetches.
	depends('app:devices');

	const fetchAllDeviceData = async (): Promise<DeviceFetchResult> => {
		if (!logtoClient) {
			return { devices: [], pairedList: [], error: 'auth_expired' };
		}

		// Wait for authState to finish init before checking auth. The SDK refreshes
		// stale tokens via refresh-token grant inside init() / fetchUserInfo, so
		// checking logtoClient.isAuthenticated() (local-only check) before this
		// completes is racy and can falsely report auth_expired during the loading
		// window after a long-idle browser refresh.
		await authState.init();
		if (!authState.isAuthenticated) {
			return { devices: [], pairedList: [], error: 'auth_expired' };
		}

		// Get the token - SDK handles refresh automatically
		let token = await getIdToken();
		if (!token) {
			return { devices: [], pairedList: [], error: 'auth_expired' };
		}

		// Helper to fetch list
		const fetchList = async (t: string) => {
			return await APIv1Client.GET('/v1/users/{userId}/devices', {
				params: { path: { userId: 'self' } },
				headers: { Authorization: `Bearer ${t}` }
			});
		};

		try {
			// Fetch the list with retry
			let devices = await fetchList(token);

			// If 401, refresh session (re-validates with server) and retry
			if (devices.response.status === 401) {
				const refreshed = await authState.refreshSession();
				if (refreshed) {
					token = await getIdToken();
					if (token) {
						devices = await fetchList(token);
					} else {
						return { devices: [], pairedList: [], error: 'auth_expired' };
					}
				} else {
					return { devices: [], pairedList: [], error: 'auth_expired' };
				}
			}

			// If still failing after retry, it's an auth or API error
			if (!devices.response.ok) {
				const isAuthError = devices.response.status === 401 || devices.response.status === 403;
				return {
					devices: [],
					pairedList: [],
					error: isAuthError ? 'auth_expired' : 'api_error'
				};
			}

			const items = devices.data?.items ?? [];
			const ids = items.map((d) => d.device_id).filter((s): s is string => !!s);

			// Resolve which device to fetch full detail for. Keep cost constant —
			// only the selected device gets a detail fetch on root navigation; the
			// /dashboard/devices page hydrates the rest when visited.
			const persisted =
				typeof localStorage !== 'undefined'
					? localStorage.getItem('selectedDeviceId') || undefined
					: undefined;
			const selectedId = persisted && ids.includes(persisted) ? persisted : ids[0];

			let selectedDetail: DeviceAuthResponseModel | null = null;
			if (selectedId && token) {
				const detailResp = await APIv0Client.GET('/device/{deviceId}', {
					params: { path: { deviceId: selectedId } },
					headers: { Authorization: `Bearer ${token}` }
				});
				if (detailResp.response.status === 401) {
					const fresh = await getIdToken();
					if (fresh) {
						const retry = await APIv0Client.GET('/device/{deviceId}', {
							params: { path: { deviceId: selectedId } },
							headers: { Authorization: `Bearer ${fresh}` }
						});
						selectedDetail = retry.data ?? null;
					}
				} else {
					selectedDetail = detailResp.data ?? null;
				}
			}

			return {
				devices: selectedDetail ? [selectedDetail] : [],
				pairedList: items,
				error: null
			};
		} catch (e) {
			console.error('Failed to fetch devices:', e);
			return { devices: [], pairedList: [], error: 'api_error' };
		}
	};

	return {
		// Return the Promise directly for streaming
		streamed: {
			deviceResult: fetchAllDeviceData()
		}
	};
};

export const prerender = false;
export const ssr = false;
