export type SettingCategory = 'device' | 'toggles' | 'steering' | 'cruise' | 'visuals' | 'developer';

export interface SettingDefinition {
	key: string;
	label: string;
	description: string;
	category: SettingCategory;
}

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
	// Device
	{ key: 'DongleId', label: 'Dongle ID', description: 'Unique device identifier', category: 'device' },
	{ key: 'GitCommit', label: 'Git Commit', description: 'Current software version', category: 'device' },
	{ key: 'GithubSshKeys', label: 'GitHub SSH Keys', description: 'SSH keys for GitHub access', category: 'device' },
	{ key: 'GithubUsername', label: 'GitHub Username', description: 'Connected GitHub account', category: 'device' },
	{ key: 'GsmMetered', label: 'GSM Metered', description: 'Cellular data metering', category: 'device' },
	{ key: 'IsLdwEnabled', label: 'LDW Enabled', description: 'Lane departure warnings', category: 'device' },
	{ key: 'IsMetric', label: 'Metric Units', description: 'Display metric measurements', category: 'device' },
	{ key: 'LanguageSetting', label: 'Language', description: 'UI language', category: 'device' },
	{ key: 'OpenpilotEnabledToggle', label: 'Openpilot Enabled', description: 'Master openpilot toggle', category: 'device' },
	{ key: 'RecordFront', label: 'Record Front', description: 'Front camera recording', category: 'device' },
	{ key: 'IsRHD', label: 'Right-Hand Drive', description: 'RHD vehicle configuration', category: 'device' },
	{ key: 'Version', label: 'Version', description: 'Software version number', category: 'device' },

	// Toggles
	{ key: 'DisableLogging', label: 'Disable Logging', description: 'Stop data logging', category: 'toggles' },
	{ key: 'DisableOnroadUploads', label: 'Disable Onroad Uploads', description: 'No uploads while driving', category: 'toggles' },
	{ key: 'DisablePowerDown', label: 'Disable Power Down', description: 'Stay on after ignition off', category: 'toggles' },
	{ key: 'DisableUpdates', label: 'Disable Updates', description: 'Skip software updates', category: 'toggles' },
	{ key: 'EnableWideCamera', label: 'Wide Camera', description: 'Use wide-angle camera', category: 'toggles' },

	// Steering
	{ key: 'EndToEndLong', label: 'End-to-End Long', description: 'E2E longitudinal control', category: 'steering' },
	{ key: 'LongitudinalPersonality', label: 'Personality', description: 'Driving style preference', category: 'steering' },

	// Cruise
	{ key: 'ExperimentalMode', label: 'Experimental Mode', description: 'Enable experimental features', category: 'cruise' },

	// Visuals
	{ key: 'Brightness', label: 'Brightness', description: 'Screen brightness level', category: 'visuals' },
	{ key: 'BrightnessOff', label: 'Brightness (Off)', description: 'Screen brightness when off', category: 'visuals' },

	// Developer
	{ key: 'ApiCache_DriveStats', label: 'API Cache: Drive Stats', description: 'Drive stats cache', category: 'developer' },
	{ key: 'ApiCache_Device', label: 'API Cache: Device', description: 'Device info cache', category: 'developer' },
	{ key: 'ApiCache_NavDestinations', label: 'API Cache: Nav Destinations', description: 'Navigation cache', category: 'developer' },
	{ key: 'AthenadPid', label: 'Athena PID', description: 'Athena process ID', category: 'developer' },
	{ key: 'BootCount', label: 'Boot Count', description: 'Number of boots', category: 'developer' },
	{ key: 'CalibrationParams', label: 'Calibration Params', description: 'Camera calibration data', category: 'developer' },
	{ key: 'CarBatteryCapacity', label: 'Car Battery Capacity', description: 'Battery size in kWh', category: 'developer' },
	{ key: 'CarParams', label: 'Car Params', description: 'Vehicle parameters', category: 'developer' },
	{ key: 'CarParamsCache', label: 'Car Params Cache', description: 'Cached vehicle params', category: 'developer' },
	{ key: 'CarVin', label: 'Car VIN', description: 'Vehicle identification', category: 'developer' },
	{ key: 'CompletedTrainingVersion', label: 'Training Version', description: 'Last completed training', category: 'developer' },
	{ key: 'ControlsReady', label: 'Controls Ready', description: 'System ready status', category: 'developer' },
	{ key: 'CurrentRoute', label: 'Current Route', description: 'Active drive route', category: 'developer' },
	{ key: 'IMEI', label: 'IMEI', description: 'Cellular modem ID', category: 'developer' },
	{ key: 'InstallDate', label: 'Install Date', description: 'Installation timestamp', category: 'developer' },
	{ key: 'IsEngaged', label: 'Is Engaged', description: 'Currently engaged', category: 'developer' },
	{ key: 'IsFcwEnabled', label: 'FCW Enabled', description: 'Forward collision warning', category: 'developer' },
	{ key: 'IsOffroad', label: 'Is Offroad', description: 'Not currently driving', category: 'developer' },
	{ key: 'IsOnroad', label: 'Is Onroad', description: 'Currently driving', category: 'developer' },
	{ key: 'IsReleaseBranch', label: 'Is Release Branch', description: 'On release software', category: 'developer' },
	{ key: 'IsTestedBranch', label: 'Is Tested Branch', description: 'On tested software', category: 'developer' },
	{ key: 'IsUpdateAvailable', label: 'Update Available', description: 'Update pending', category: 'developer' },
	{ key: 'LastAthenaPingTime', label: 'Last Athena Ping', description: 'Last server contact', category: 'developer' },
	{ key: 'LastGPSPosition', label: 'Last GPS Position', description: 'GPS coordinates', category: 'developer' },
	{ key: 'LastOffroadStatusPacket', label: 'Last Offroad Packet', description: 'Last status update', category: 'developer' },
	{ key: 'LastUpdateException', label: 'Last Update Exception', description: 'Update error info', category: 'developer' },
	{ key: 'LastUpdateTime', label: 'Last Update Time', description: 'Last update timestamp', category: 'developer' },
	{ key: 'LiveParameters', label: 'Live Parameters', description: 'Runtime parameters', category: 'developer' },
	{ key: 'NavDestination', label: 'Nav Destination', description: 'Navigation target', category: 'developer' },
	{ key: 'NavSettingLeftSide', label: 'Nav Left Side', description: 'Left-side navigation', category: 'developer' },
	{ key: 'NavSettingTime24h', label: 'Nav 24h Time', description: '24-hour time format', category: 'developer' },
	{ key: 'NavdRender', label: 'Nav Render', description: 'Navigation rendering', category: 'developer' },
	{ key: 'NetworkMetered', label: 'Network Metered', description: 'Metered connection', category: 'developer' },
	{ key: 'NetworkType', label: 'Network Type', description: 'Connection type', category: 'developer' },
	{ key: 'Offroad_BadNvme', label: 'Offroad: Bad NVMe', description: 'Storage error', category: 'developer' },
	{ key: 'Offroad_CarUnrecognized', label: 'Offroad: Car Unrecognized', description: 'Unknown vehicle', category: 'developer' },
	{ key: 'Offroad_ConnectivityNeeded', label: 'Offroad: Connectivity Needed', description: 'Internet required', category: 'developer' },
	{ key: 'Offroad_InvalidTime', label: 'Offroad: Invalid Time', description: 'Time sync error', category: 'developer' },
	{ key: 'Offroad_IsTakingSnapshot', label: 'Offroad: Taking Snapshot', description: 'Snapshot in progress', category: 'developer' },
	{ key: 'Offroad_NeosUpdate', label: 'Offroad: NEOS Update', description: 'OS update required', category: 'developer' },
	{ key: 'Offroad_NoFirmware', label: 'Offroad: No Firmware', description: 'Firmware missing', category: 'developer' },
	{ key: 'Offroad_StorageMissing', label: 'Offroad: Storage Missing', description: 'Storage not found', category: 'developer' },
	{ key: 'Offroad_TemperatureTooHigh', label: 'Offroad: Temperature High', description: 'Overheating', category: 'developer' },
	{ key: 'Offroad_UnofficialHardware', label: 'Offroad: Unofficial Hardware', description: 'Unsupported device', category: 'developer' },
	{ key: 'Offroad_UpdateFailed', label: 'Offroad: Update Failed', description: 'Update error', category: 'developer' },
	{ key: 'Passive', label: 'Passive', description: 'Passive mode', category: 'developer' },
	{ key: 'PrimeRedirected', label: 'Prime Redirected', description: 'Prime redirect status', category: 'developer' },
	{ key: 'PrimeType', label: 'Prime Type', description: 'Prime subscription type', category: 'developer' },
	{ key: 'SnoozeUpdate', label: 'Snooze Update', description: 'Update snooze timer', category: 'developer' },
	{ key: 'SshEnabled', label: 'SSH Enabled', description: 'SSH access enabled', category: 'developer' },
	{ key: 'TermsVersion', label: 'Terms Version', description: 'Accepted terms version', category: 'developer' },
	{ key: 'TrainingVersion', label: 'Training Version', description: 'Training software version', category: 'developer' },
	{ key: 'UpdateAvailable', label: 'Update Available', description: 'Update ready', category: 'developer' },
	{ key: 'UpdateFailedCount', label: 'Update Failed Count', description: 'Failed update attempts', category: 'developer' },
	{ key: 'UpdaterAvailableBranches', label: 'Available Branches', description: 'Update branches', category: 'developer' },
	{ key: 'UpdaterCurrentDescription', label: 'Current Description', description: 'Current branch info', category: 'developer' },
	{ key: 'UpdaterCurrentReleaseNotes', label: 'Current Release Notes', description: 'Release notes', category: 'developer' },
	{ key: 'UpdaterFetchAvailable', label: 'Updater Fetch Available', description: 'Update check ready', category: 'developer' },
	{ key: 'UpdaterNewDescription', label: 'New Description', description: 'New version info', category: 'developer' },
	{ key: 'UpdaterNewReleaseNotes', label: 'New Release Notes', description: 'New release notes', category: 'developer' },
	{ key: 'UpdaterState', label: 'Updater State', description: 'Update system state', category: 'developer' },
	{ key: 'UpdaterTargetBranch', label: 'Target Branch', description: 'Update target branch', category: 'developer' }
];