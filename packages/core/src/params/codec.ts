import type { DeviceParamLike, ParamEncodeInput } from './types';

interface BufferLike {
	from(input: string, encoding: 'base64' | 'binary'): {
		toString(encoding: 'base64' | 'binary'): string;
	};
}

function getBufferCtor(): BufferLike | undefined {
	return (globalThis as typeof globalThis & { Buffer?: BufferLike }).Buffer;
}

function decodeBase64(value: string): string {
	if (typeof globalThis.atob === 'function') {
		return globalThis.atob(value);
	}

	const BufferCtor = getBufferCtor();
	if (BufferCtor) {
		return BufferCtor.from(value, 'base64').toString('binary');
	}

	throw new Error('No base64 decoder available in this runtime');
}

function encodeBase64(value: string): string {
	if (typeof globalThis.btoa === 'function') {
		return globalThis.btoa(value);
	}

	const BufferCtor = getBufferCtor();
	if (BufferCtor) {
		return BufferCtor.from(value, 'binary').toString('base64');
	}

	throw new Error('No base64 encoder available in this runtime');
}

export function decodeParamValue(param: DeviceParamLike): unknown {
	if (param.value === null || param.value === undefined) {
		return null;
	}

	if (param.type === 'Bytes') {
		return param.value;
	}

	try {
		const binaryString = decodeBase64(param.value);
		const bytes = Uint8Array.from(binaryString, (character) => character.charCodeAt(0));
		const decodedString = new TextDecoder().decode(bytes);

		switch (param.type) {
			case 'String':
				return decodedString;
			case 'Bool':
				return decodedString === '1' || decodedString.toLowerCase() === 'true';
			case 'Int':
				return parseInt(decodedString, 10);
			case 'Float':
				return parseFloat(parseFloat(decodedString).toFixed(2));
			case 'Json':
				return JSON.parse(decodedString);
			case 'Time':
				return decodedString;
			default:
				return decodedString;
		}
	} catch (error) {
		console.error(`Failed to decode param ${param.key}:`, error);
		return null;
	}
}

export function encodeParamValue(param: ParamEncodeInput): string | null {
	if (param.value === null || param.value === undefined) {
		return null;
	}

	if (param.type === 'Bytes') {
		return String(param.value);
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

		const bytes = new TextEncoder().encode(stringValue);
		const binaryString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
		return encodeBase64(binaryString);
	} catch (error) {
		console.error(`Failed to encode param ${param.key}:`, error);
		return null;
	}
}
