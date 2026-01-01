import { describe, expect, it } from 'vitest';
import { isIdTokenExpiring, pickValidAccessToken } from './auth.svelte';

describe('pickValidAccessToken', () => {
	it('returns the token with the furthest expiry when still valid', () => {
		const now = 1_700_000_000;
		const token = pickValidAccessToken(
			{
				'@': { token: 't1', expiresAt: now + 120 },
				other: { token: 't2', expiresAt: now + 240 }
			},
			now,
			30
		);

		expect(token).toBe('t2');
	});

	it('ignores tokens that are expired or inside the skew window', () => {
		const now = 1_700_000_000;
		const token = pickValidAccessToken(
			{
				expired: { token: 'old', expiresAt: now - 10 },
				almost: { token: 'soon', expiresAt: now + 20 }
			},
			now,
			30
		);

		expect(token).toBeUndefined();
	});

	it('returns undefined when no usable token exists', () => {
		const token = pickValidAccessToken({}, 1_700_000_000, 30);

		expect(token).toBeUndefined();
	});
});

describe('isIdTokenExpiring', () => {
	const buildToken = (exp: number) => {
		const encode = (value: object) =>
			Buffer.from(JSON.stringify(value)).toString('base64url');
		return `${encode({ alg: 'HS256' })}.${encode({ exp })}.sig`;
	};

	it('returns false for a token well before expiry', () => {
		const token = buildToken(Math.floor(Date.now() / 1000) + 300);
		expect(isIdTokenExpiring(token, 30)).toBe(false);
	});

	it('returns true for expiring token within skew', () => {
		const token = buildToken(Math.floor(Date.now() / 1000) + 20);
		expect(isIdTokenExpiring(token, 30)).toBe(true);
	});

	it('returns true for malformed token', () => {
		expect(isIdTokenExpiring('bad.token')).toBe(true);
	});
});
