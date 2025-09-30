export type SettingCategory = 'device' | 'toggles' | 'steering' | 'cruise' | 'visuals' | 'developer';

export interface SettingDefinition {
	key: string;
	label: string;
	description: string;
	type: 'bool' | 'select';
	category: SettingCategory;
}

export const SETTINGS_DEFINITIONS: SettingDefinition[] = [
	// Device
	{ key: 'DongleId', label: 'Dongle ID', description: 'Unique device identifier', type: 'select', category: 'device' },
	{ key: 'GitCommit', label: 'Git Commit', description: 'Current software version', type: 'select', category: 'device' },
	{ key: 'GithubSshKeys', label: 'GitHub SSH Keys', description: 'SSH keys for GitHub access', type: 'select', category: 'device' },
	{ key: 'GithubUsername', label: 'GitHub Username', description: 'Connected GitHub account', type: 'select', category: 'device' },
	{ key: 'GsmMetered', label: 'GSM Metered', description: 'Cellular data metering', type: 'bool', category: 'device' },
	{ key: 'IsLdwEnabled', label: 'LDW Enabled', description: 'Lane departure warnings', type: 'bool', category: 'device' },
	{ key: 'IsMetric', label: 'Metric Units', description: 'Display metric measurements', type: 'bool', category: 'device' },
	{ key: 'LanguageSetting', label: 'Language', description: 'UI language', type: 'select', category: 'device' },
	{ key: 'OpenpilotEnabledToggle', label: 'Openpilot Enabled', description: 'Master openpilot toggle', type: 'bool', category: 'device' },
	{ key: 'RecordFront', label: 'Record Front', description: 'Front camera recording', type: 'bool', category: 'device' },
	{ key: 'IsRHD', label: 'Right-Hand Drive', description: 'RHD vehicle configuration', type: 'bool', category: 'device' },
	{ key: 'Version', label: 'Version', description: 'Software version number', type: 'select', category: 'device' },

	// Toggles
	{ key: 'DisableLogging', label: 'Disable Logging', description: 'Stop data logging', type: 'bool', category: 'toggles' },
	{ key: 'DisableOnroadUploads', label: 'Disable Onroad Uploads', description: 'No uploads while driving', type: 'bool', category: 'toggles' },
	{ key: 'DisablePowerDown', label: 'Disable Power Down', description: 'Stay on after ignition off', type: 'bool', category: 'toggles' },
	{ key: 'DisableUpdates', label: 'Disable Updates', description: 'Skip software updates', type: 'bool', category: 'toggles' },
	{ key: 'EnableWideCamera', label: 'Wide Camera', description: 'Use wide-angle camera', type: 'bool', category: 'toggles' },

	// Steering
	{ key: 'EndToEndLong', label: 'End-to-End Long', description: 'E2E longitudinal control', type: 'bool', category: 'steering' },
	{ key: 'LongitudinalPersonality', label: 'Personality', description: 'Driving style preference', type: 'select', category: 'steering' },

	// Cruise
	{ key: 'ExperimentalMode', label: 'Experimental Mode', description: 'Enable experimental features', type: 'bool', category: 'cruise' },

	// Visuals
	{ key: 'Brightness', label: 'Brightness', description: 'Screen brightness level', type: 'select', category: 'visuals' },
	{ key: 'BrightnessOff', label: 'Brightness (Off)', description: 'Screen brightness when off', type: 'select', category: 'visuals' },

	// Developer
	{ key: 'ApiCache_DriveStats', label: 'API Cache: Drive Stats', description: 'Drive stats cache', type: 'select', category: 'developer' },
	{ key: 'ApiCache_Device', label: 'API Cache: Device', description: 'Device info cache', type: 'select', category: 'developer' },
	{ key: 'ApiCache_NavDestinations', label: 'API Cache: Nav Destinations', description: 'Navigation cache', type: 'select', category: 'developer' },
	{ key: 'AthenadPid', label: 'Athena PID', description: 'Athena process ID', type: 'select', category: 'developer' },
	{ key: 'BootCount', label: 'Boot Count', description: 'Number of boots', type: 'select', category: 'developer' },
	{ key: 'CalibrationParams', label: 'Calibration Params', description: 'Camera calibration data', type: 'select', category: 'developer' },
	{ key: 'CarBatteryCapacity', label: 'Car Battery Capacity', description: 'Battery size in kWh', type: 'select', category: 'developer' },
	{ key: 'CarParams', label: 'Car Params', description: 'Vehicle parameters', type: 'select', category: 'developer' },
	{ key: 'CarParamsCache', label: 'Car Params Cache', description: 'Cached vehicle params', type: 'select', category: 'developer' },
	{ key: 'CarVin', label: 'Car VIN', description: 'Vehicle identification', type: 'select', category: 'developer' },
	{ key: 'CompletedTrainingVersion', label: 'Training Version', description: 'Last completed training', type: 'select', category: 'developer' },
	{ key: 'ControlsReady', label: 'Controls Ready', description: 'System ready status', type: 'bool', category: 'developer' },
	{ key: 'CurrentRoute', label: 'Current Route', description: 'Active drive route', type: 'select', category: 'developer' },
	{ key: 'IMEI', label: 'IMEI', description: 'Cellular modem ID', type: 'select', category: 'developer' },
	{ key: 'InstallDate', label: 'Install Date', description: 'Installation timestamp', type: 'select', category: 'developer' },
	{ key: 'IsEngaged', label: 'Is Engaged', description: 'Currently engaged', type: 'bool', category: 'developer' },
	{ key: 'IsFcwEnabled', label: 'FCW Enabled', description: 'Forward collision warning', type: 'bool', category: 'developer' },
	{ key: 'IsOffroad', label: 'Is Offroad', description: 'Not currently driving', type: 'bool', category: 'developer' },
	{ key: 'IsOnroad', label: 'Is Onroad', description: 'Currently driving', type: 'bool', category: 'developer' },
	{ key: 'IsReleaseBranch', label: 'Is Release Branch', description: 'On release software', type: 'bool', category: 'developer' },
	{ key: 'IsTestedBranch', label: 'Is Tested Branch', description: 'On tested software', type: 'bool', category: 'developer' },
	{ key: 'IsUpdateAvailable', label: 'Update Available', description: 'Update pending', type: 'bool', category: 'developer' },
	{ key: 'LastAthenaPingTime', label: 'Last Athena Ping', description: 'Last server contact', type: 'select', category: 'developer' },
	{ key: 'LastGPSPosition', label: 'Last GPS Position', description: 'GPS coordinates', type: 'select', category: 'developer' },
	{ key: 'LastOffroadStatusPacket', label: 'Last Offroad Packet', description: 'Last status update', type: 'select', category: 'developer' },
	{ key: 'LastUpdateException', label: 'Last Update Exception', description: 'Update error info', type: 'select', category: 'developer' },
	{ key: 'LastUpdateTime', label: 'Last Update Time', description: 'Last update timestamp', type: 'select', category: 'developer' },
	{ key: 'LiveParameters', label: 'Live Parameters', description: 'Runtime parameters', type: 'select', category: 'developer' },
	{ key: 'NavDestination', label: 'Nav Destination', description: 'Navigation target', type: 'select', category: 'developer' },
	{ key: 'NavSettingLeftSide', label: 'Nav Left Side', description: 'Left-side navigation', type: 'bool', category: 'developer' },
	{ key: 'NavSettingTime24h', label: 'Nav 24h Time', description: '24-hour time format', type: 'bool', category: 'developer' },
	{ key: 'NavdRender', label: 'Nav Render', description: 'Navigation rendering', type: 'bool', category: 'developer' },
	{ key: 'NetworkMetered', label: 'Network Metered', description: 'Metered connection', type: 'bool', category: 'developer' },
	{ key: 'NetworkType', label: 'Network Type', description: 'Connection type', type: 'select', category: 'developer' },
	{ key: 'Offroad_BadNvme', label: 'Offroad: Bad NVMe', description: 'Storage error', type: 'select', category: 'developer' },
	{ key: 'Offroad_CarUnrecognized', label: 'Offroad: Car Unrecognized', description: 'Unknown vehicle', type: 'select', category: 'developer' },
	{ key: 'Offroad_ConnectivityNeeded', label: 'Offroad: Connectivity Needed', description: 'Internet required', type: 'select', category: 'developer' },
	{ key: 'Offroad_InvalidTime', label: 'Offroad: Invalid Time', description: 'Time sync error', type: 'select', category: 'developer' },
	{ key: 'Offroad_IsTakingSnapshot', label: 'Offroad: Taking Snapshot', description: 'Snapshot in progress', type: 'select', category: 'developer' },
	{ key: 'Offroad_NeosUpdate', label: 'Offroad: NEOS Update', description: 'OS update required', type: 'select', category: 'developer' },
	{ key: 'Offroad_NoFirmware', label: 'Offroad: No Firmware', description: 'Firmware missing', type: 'select', category: 'developer' },
	{ key: 'Offroad_StorageMissing', label: 'Offroad: Storage Missing', description: 'Storage not found', type: 'select', category: 'developer' },
	{ key: 'Offroad_TemperatureTooHigh', label: 'Offroad: Temperature High', description: 'Overheating', type: 'select', category: 'developer' },
	{ key: 'Offroad_UnofficialHardware', label: 'Offroad: Unofficial Hardware', description: 'Unsupported device', type: 'select', category: 'developer' },
	{ key: 'Offroad_UpdateFailed', label: 'Offroad: Update Failed', description: 'Update error', type: 'select', category: 'developer' },
	{ key: 'Passive', label: 'Passive', description: 'Passive mode', type: 'bool', category: 'developer' },
	{ key: 'PrimeRedirected', label: 'Prime Redirected', description: 'Prime redirect status', type: 'bool', category: 'developer' },
	{ key: 'PrimeType', label: 'Prime Type', description: 'Prime subscription type', type: 'select', category: 'developer' },
	{ key: 'SnoozeUpdate', label: 'Snooze Update', description: 'Update snooze timer', type: 'select', category: 'developer' },
	{ key: 'SshEnabled', label: 'SSH Enabled', description: 'SSH access enabled', type: 'bool', category: 'developer' },
	{ key: 'TermsVersion', label: 'Terms Version', description: 'Accepted terms version', type: 'select', category: 'developer' },
	{ key: 'TrainingVersion', label: 'Training Version', description: 'Training software version', type: 'select', category: 'developer' },
	{ key: 'UpdateAvailable', label: 'Update Available', description: 'Update ready', type: 'bool', category: 'developer' },
	{ key: 'UpdateFailedCount', label: 'Update Failed Count', description: 'Failed update attempts', type: 'select', category: 'developer' },
	{ key: 'UpdaterAvailableBranches', label: 'Available Branches', description: 'Update branches', type: 'select', category: 'developer' },
	{ key: 'UpdaterCurrentDescription', label: 'Current Description', description: 'Current branch info', type: 'select', category: 'developer' },
	{ key: 'UpdaterCurrentReleaseNotes', label: 'Current Release Notes', description: 'Release notes', type: 'select', category: 'developer' },
	{ key: 'UpdaterFetchAvailable', label: 'Updater Fetch Available', description: 'Update check ready', type: 'select', category: 'developer' },
	{ key: 'UpdaterNewDescription', label: 'New Description', description: 'New version info', type: 'select', category: 'developer' },
	{ key: 'UpdaterNewReleaseNotes', label: 'New Release Notes', description: 'New release notes', type: 'select', category: 'developer' },
	{ key: 'UpdaterState', label: 'Updater State', description: 'Update system state', type: 'select', category: 'developer' },
	{ key: 'UpdaterTargetBranch', label: 'Target Branch', description: 'Update target branch', type: 'select', category: 'developer' }
];