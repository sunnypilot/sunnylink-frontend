import { writable } from 'svelte/store';
import { vi } from 'vitest';

export const authState = writable({ isAuthenticated: false });
export const logtoClient = {
	signIn: vi.fn(),
	signOut: vi.fn()
};
