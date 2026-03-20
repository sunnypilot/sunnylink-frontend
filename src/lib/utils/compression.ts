/**
 * Decompression utility for gzip-compressed, base64-encoded data.
 *
 * The device compresses SettingsSchema as:
 *   JSON → UTF-8 → gzip → base64
 *
 * This module reverses that pipeline:
 *   base64 → gzip decompress → UTF-8 → JSON.parse
 *
 * Uses native DecompressionStream API (no external dependencies).
 */

/**
 * Decompress a gzip-compressed, base64-encoded string to its original content.
 *
 * @param base64String - Base64-encoded gzip data
 * @returns The decompressed string
 */
export async function decompressBase64Gzip(base64String: string): Promise<string> {
	// 1. Base64 decode to binary
	const binaryString = atob(base64String);
	const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));

	// 2. Decompress gzip using native DecompressionStream
	const ds = new DecompressionStream('gzip');
	const writer = ds.writable.getWriter();
	writer.write(bytes);
	writer.close();

	const reader = ds.readable.getReader();
	const chunks: Uint8Array[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}

	// 3. Concatenate chunks and decode UTF-8
	const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return new TextDecoder().decode(result);
}

/**
 * Check if a string looks like gzip-compressed base64 data.
 *
 * Gzip data starts with magic bytes 0x1F 0x8B. In base64, this encodes
 * to strings starting with "H4sI" (most common gzip header).
 */
export function isCompressedBase64(value: string): boolean {
	return value.startsWith('H4sI');
}
