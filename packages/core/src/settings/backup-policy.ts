import type {
	BackupDefinitionLike,
	BackupSettingLike,
	BuildSettingsBackupInput,
	DeviceSettingsBackup
} from './types';

export const SETTINGS_BACKUP_VERSION = 2;

export const BACKUP_EXCLUDED_KEYS = new Set([
	// Heavy cache data (regenerated automatically)
	'ModelManager_ModelsCache',
	'ModelRunnerTypeCache',
	'LagdValueCache',
	'ApiCache_DriveStats',
	'ApiCache_Device',
	'ApiCache_NavDestinations',
	'ApiCache_FirehoseStats',
	'SunnylinkCache_Users',
	'SunnylinkCache_Roles',
	'AthenadRecentlyViewedRoutes',
	// CarParams — device-specific hardware data
	'CarList',
	'CarParams',
	'CarParamsCache',
	'CarParamsSP',
	'CarParamsSPCache',
	'CarParamsPrevRoute',
	'CarParamsPersistent',
	'CarParamsSPPersistent',
	'AccessToken',
	'AssistNowToken',
	'BackupManager_CreateBackup',
	'BackupManager_RestoreVersion',
	'CameraDebugExpGain',
	'CameraDebugExpTime',
	'CustomTorqueParams',
	'DoReboot',
	'DoShutdown',
	'DoUninstall',
	'DriverTooDistracted',
	'EnforceTorqueControl',
	'ExperimentalModeConfirmed',
	'ForcePowerDown',
	'GitDiff',
	'IsTakingSnapshot',
	'JoystickDebugMode',
	'LastAgnosPowerMonitorShutdown',
	'LastGPSPosition',
	'LastManagerExitReason',
	'LastOffroadStatusPacket',
	'LastPowerDropDetected',
	'LongitudinalManeuverMode',
	'MapAdvisorySpeedLimit',
	'MapSpeedLimit',
	'MapTargetVelocities',
	'ModelManager_ClearCache',
	'ModelManager_DownloadIndex',
	'NextMapSpeedLimit',
	'ObdMultiplexingChanged',
	'ObdMultiplexingEnabled',
	'Offroad_CarUnrecognized',
	'Offroad_ConnectivityNeeded',
	'Offroad_ConnectivityNeededPrompt',
	'Offroad_DriverMonitoringUncertain',
	'Offroad_ExcessiveActuation',
	'Offroad_IsTakingSnapshot',
	'Offroad_NeosUpdate',
	'Offroad_NoFirmware',
	'Offroad_OSMUpdateRequired',
	'Offroad_Recalibration',
	'Offroad_TemperatureTooHigh',
	'Offroad_TiciSupport',
	'Offroad_UnregisteredHardware',
	'Offroad_UpdateFailed',
	'OffroadMode',
	'OnroadCycleRequested',
	'OsmDbUpdatesCheck',
	'OSMDownloadBounds',
	'OSMDownloadLocations',
	'OSMDownloadProgress',
	'OsmLocationUrl',
	'OsmStateTitle',
	'OsmWayTest',
	'RecordFrontLock',
	'RoadName',
	'SecOCKey',
	'SnoozeUpdate',
	'SunnylinkTempFault',
	'TermsVersion',
	'TorqueControlTune',
	'TrainingVersion',
	// Live/ephemeral data
	'LiveTorqueParameters',
	'LiveParameters',
	'LiveParametersV2',
	'CalibrationParams',
	'LocationFilterInitialState',
	// Updater state (ephemeral)
	'UpdaterAvailableBranches',
	'UpdaterCurrentDescription',
	'UpdaterCurrentReleaseNotes',
	'UpdaterNewDescription',
	'UpdaterNewReleaseNotes',
	'UpdaterFetchAvailable',
	'UpdaterState',
	'UpdaterLastFetchTime',
	// Runtime counters / device state
	'CarBatteryCapacity',
	'GitCommit',
	'GitCommitDate',
	// Boot and uptime tracking
	'BootCount',
	'CurrentBootlog',
	'UptimeOnroad',
	'UptimeOffroad',
	// Route tracking
	'RouteCount',
	'CurrentRoute',
	// Last update tracking
	'LastUpdateException',
	'LastUpdateTime',
	'LastUpdateRouteCount',
	'LastUpdateUptimeOnroad',
	// Panda hardware state
	'PandaHeartbeatLost',
	'PandaSomResetTriggered',
	'PandaSignatures',
	// Process PIDs
	'AthenadPid',
	'SunnylinkdPid'
]);

export function getBackupKeys<
	TDefinition extends BackupDefinitionLike,
	TSetting extends BackupSettingLike
>(definitions: readonly TDefinition[], deviceSettings?: readonly TSetting[]): string[] {
	const defsMap = new Map(definitions.map((definition) => [definition.key, definition]));

	let keys: string[];
	if (deviceSettings && deviceSettings.length > 0) {
		keys = deviceSettings
			.map((setting) => setting.key)
			.filter((key): key is string => key !== undefined);
	} else {
		keys = definitions.map((definition) => definition.key);
	}

	return keys
		.filter((key) => {
			if (BACKUP_EXCLUDED_KEYS.has(key)) return false;
			if (key.startsWith('_sec_')) return false;
			return !defsMap.get(key)?.isSection;
		})
		.sort((left, right) => left.localeCompare(right));
}

export function buildSettingsBackup<TValue = unknown>({
	deviceId,
	settings,
	unavailableSettings,
	timestamp = Date.now()
}: BuildSettingsBackupInput<TValue>): DeviceSettingsBackup<TValue> {
	const sortedSettings = Object.fromEntries(
		Object.entries(settings).sort(([left], [right]) => left.localeCompare(right))
	) as Record<string, TValue>;

	const sortedUnavailable = unavailableSettings
		? [...unavailableSettings].sort((left, right) => left.key.localeCompare(right.key))
		: undefined;

	return {
		version: SETTINGS_BACKUP_VERSION,
		timestamp,
		deviceId,
		settings: sortedSettings,
		...(sortedUnavailable && sortedUnavailable.length > 0
			? { unavailable_settings: sortedUnavailable }
			: {})
	};
}

export function parseSettingsBackup(json: string): DeviceSettingsBackup {
	try {
		const parsed = JSON.parse(json) as Partial<DeviceSettingsBackup>;
		if (!parsed.version || !parsed.settings) {
			throw new Error('Invalid backup format');
		}
		return parsed as DeviceSettingsBackup;
	} catch {
		throw new Error('Failed to parse settings backup file');
	}
}
