import type { components } from '../../sunnylink/v1/schema';

type DeviceParam = components['schemas']['DeviceParam'];

export function decodeParamValue(param: DeviceParam): unknown {
	if (param.value === null || param.value === undefined) {
		return null;
	}

	try {
		// Decode Base64
		const binaryString = atob(param.value);
		const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));

		// For Bytes type, return the raw Uint8Array
		if (param.type === 'Bytes') {
			return bytes;
		}

		// For other types, decode as UTF-8 string first
		const decodedString = new TextDecoder().decode(bytes);

		switch (param.type) {
			case 'String':
				return decodedString;
			case 'Bool':
				return decodedString === '1' || decodedString.toLowerCase() === 'true';
			case 'Int':
				return parseInt(decodedString, 10);
			case 'Float':
				return parseFloat(decodedString);
			case 'Json':
				return JSON.parse(decodedString);
			case 'Time':
				return decodedString;
			default:
				return decodedString;
		}
	} catch (e) {
		console.error(`Failed to decode param ${param.key}:`, e);
		return null;
	}
}
