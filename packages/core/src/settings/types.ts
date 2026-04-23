export interface BackupDefinitionLike {
	key: string;
	isSection?: boolean;
}

export interface BackupSettingLike {
	key?: string;
}

export interface UnavailableSetting {
	key: string;
	reason: string;
}

export interface DeviceSettingsBackup<TValue = unknown> {
	version: number;
	timestamp: number;
	deviceId: string;
	settings: Record<string, TValue>;
	unavailable_settings?: UnavailableSetting[];
}

export interface BuildSettingsBackupInput<TValue = unknown> {
	deviceId: string;
	settings: Record<string, TValue>;
	unavailableSettings?: readonly UnavailableSetting[];
	timestamp?: number;
}
