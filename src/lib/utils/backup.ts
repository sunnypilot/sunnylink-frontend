import { deviceState } from '$lib/stores/device.svelte';
import { Athenav1Client } from '$lib/api/client';
import { fetchAllSettings, downloadSettingsBackup } from '$lib/utils/settings';
import { logtoClient } from '$lib/logto/auth.svelte';

/**
 * Download a settings backup for a device.
 *
 * Called from multiple surfaces (/dashboard, /dashboard/devices/[id]/about) that
 * all share the same backup state in deviceState + the same BackupProgressModal.
 * The caller is responsible for mounting BackupProgressModal somewhere in the
 * page tree; this helper only drives the store + the underlying fetch.
 */
export async function startBackup(deviceId: string, fullRefresh: boolean = false): Promise<void> {
	if (!deviceId || deviceState.backupState.isDownloading) return;

	const currentValues =
		fullRefresh || deviceState.backupState.deviceId !== deviceId
			? deviceState.deviceValues[deviceId] || {}
			: {
					...(deviceState.deviceValues[deviceId] || {}),
					...(deviceState.backupState.fetchedSettings || {})
				};

	deviceState.startBackup(deviceId);

	try {
		const token = await logtoClient?.getIdToken();
		if (!token) throw new Error('Not authenticated');

		const result = await fetchAllSettings(
			deviceId,
			Athenav1Client,
			token,
			currentValues,
			(progress, status) => {
				deviceState.setBackupProgress(progress, status);
			},
			deviceState.backupState.abortController?.signal,
			deviceState.deviceSettings[deviceId]
		);

		Object.entries(result.settings).forEach(([key, value]) => {
			if (currentValues[key] === undefined) {
				if (!deviceState.deviceValues[deviceId]) deviceState.deviceValues[deviceId] = {};
				(deviceState.deviceValues[deviceId] as Record<string, unknown>)[key] = value;
			}
		});

		deviceState.setBackupFetchedSettings(result.settings);

		if (result.failedKeys.length > 0) {
			deviceState.finishBackup(
				false,
				`${result.failedKeys.length} of ${Object.keys(result.settings).length + result.failedKeys.length} settings could not be fetched.`,
				result.failedKeys
			);
		} else {
			downloadSettingsBackup(deviceId, result.settings);
			deviceState.finishBackup(true);
			if (deviceState.backupState.isOpen) {
				setTimeout(() => {
					deviceState.closeBackupModal();
				}, 1000);
			}
		}
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg === 'Backup cancelled') {
			deviceState.finishBackup(false, 'Backup cancelled');
		} else {
			console.error('Failed to download backup', e);
			deviceState.finishBackup(false, 'Failed to download backup');
		}
	}
}

/**
 * Retry the failed keys from the previous backup attempt, merging into the
 * existing partial result. If all keys succeed, writes the merged file.
 */
export async function retryFailedBackup(): Promise<void> {
	const bs = deviceState.backupState;
	if (!bs.deviceId || !bs.failedKeys.length || !bs.fetchedSettings) return;

	const deviceId = bs.deviceId;
	const failedKeyNames = bs.failedKeys.map((f) => f.key);
	const previousSettings = { ...bs.fetchedSettings };

	deviceState.startBackup(deviceId);

	try {
		const token = await logtoClient?.getIdToken();
		if (!token) throw new Error('Not authenticated');

		const result = await fetchAllSettings(
			deviceId,
			Athenav1Client,
			token,
			previousSettings,
			(progress, status) => {
				deviceState.setBackupProgress(progress, status);
			},
			deviceState.backupState.abortController?.signal,
			deviceState.deviceSettings[deviceId],
			failedKeyNames
		);

		const mergedSettings = { ...previousSettings, ...result.settings };
		deviceState.setBackupFetchedSettings(mergedSettings);

		if (result.failedKeys.length > 0) {
			deviceState.finishBackup(
				false,
				`${result.failedKeys.length} settings still could not be fetched.`,
				result.failedKeys
			);
		} else {
			downloadSettingsBackup(deviceId, mergedSettings);
			deviceState.finishBackup(true);
			if (deviceState.backupState.isOpen) {
				setTimeout(() => {
					deviceState.closeBackupModal();
				}, 1000);
			}
		}
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg === 'Backup cancelled') {
			deviceState.finishBackup(false, 'Backup cancelled');
		} else {
			console.error('Failed to retry backup', e);
			deviceState.finishBackup(false, 'Retry failed');
		}
	}
}
