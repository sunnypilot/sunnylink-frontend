export type ParamType = 'String' | 'Bool' | 'Int' | 'Float' | 'Time' | 'Json' | 'Bytes';

export interface DeviceParamLike {
	key: string;
	value: string | null | undefined;
	type?: ParamType | 'Unknown' | undefined;
}

export interface ParamEncodeInput {
	key: string;
	value: unknown;
	type: string;
}
