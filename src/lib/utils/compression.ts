const DECOMPRESS_TIMEOUT_MS = 10000;

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

	const readWithTimeout = async (): Promise<T> => {
		const chunks: Uint8Array[] = [];
		let totalLength = 0;

		while (true) {
			const readPromise = reader.read();
			const timeoutPromise = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Decompression timed out')), DECOMPRESS_TIMEOUT_MS)
			);

			const { done, value } = await Promise.race([readPromise, timeoutPromise]);
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

		return JSON.parse(new TextDecoder().decode(result)) as T;
	};

	try {
		return await readWithTimeout();
	} catch (e) {
		reader.cancel().catch(() => {});
		throw e;
	}
}
