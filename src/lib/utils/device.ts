import type { components } from '../../sunnylink/v1/schema';

type DeviceParam = components['schemas']['DeviceParam'];

export function decodeParamValue(param: DeviceParam): unknown {
	if (param.value === null || param.value === undefined) {
		return null;
	}

	// For Bytes type, return the raw Base64 string directly
	if (param.type === 'Bytes') {
		return param.value;
	}

	try {
		// Decode Base64
		const binaryString = atob(param.value);
		const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));

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

export function encodeParamValue(param: { key: string; value: any; type: string }) {
	if (param.value === null || param.value === undefined) {
		return null;
	}

	// For Bytes type, value is already Base64 string, return as is
	if (param.type === 'Bytes') {
		return param.value;
	}

	try {
		let stringValue = '';

		switch (param.type) {
			case 'Bool':
				stringValue = param.value ? '1' : '0';
				break;
			case 'Int':
			case 'Float':
				stringValue = String(param.value);
				break;
			case 'Json':
				stringValue = typeof param.value === 'string' ? param.value : JSON.stringify(param.value);
				break;
			case 'String':
			default:
				stringValue = String(param.value);
				break;
		}

		// Encode to Base64
		// We use TextEncoder to handle UTF-8 characters correctly
		const bytes = new TextEncoder().encode(stringValue);
		// Convert Uint8Array to binary string
		const binaryString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
		return btoa(binaryString);
	} catch (e) {
		console.error(`Failed to encode param ${param.key}:`, e);
		return null;
	}
}
