/**
 * Decompresses a base64-encoded gzip string and parses it as JSON.
 *
 * Pipeline: base64 decode -> gzip decompress -> JSON.parse
 *
 * Uses the native DecompressionStream API (Chrome 80+, Firefox 113+, Safari 16.4+).
 *
 * Note: writer.write() and writer.close() are intentionally not awaited —
 * DecompressionStream requires the readable side to be consumed before the
 * writable side resolves. Awaiting both sides creates a deadlock.
 * Errors from malformed data surface on reader.read() and are caught there.
 */
export async function decodeCompressedJson<T>(base64String: string): Promise<T> {
	const binaryString = atob(base64String);
	const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));

	const ds = new DecompressionStream('gzip');
	const writer = ds.writable.getWriter();
	writer.write(bytes).catch(() => {});
	writer.close().catch(() => {});

	const reader = ds.readable.getReader();
	const chunks: Uint8Array[] = [];
	let totalLength = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		totalLength += value.length;
	}

	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	const jsonString = new TextDecoder().decode(result);

	return JSON.parse(jsonString) as T;
}
