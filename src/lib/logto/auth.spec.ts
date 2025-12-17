import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock values
const PRODUCTION_URL = 'https://sunnylink.ai';

// Mock config module - Mocking this implies we trust the alias resolution
vi.mock('$lib/config', () => ({
    PUBLIC_PRODUCTION_APP_URL: 'https://sunnylink.ai'
}));

// Mock $env/static/public
vi.mock('$env/static/public', () => ({
    PUBLIC_LOGTO_ENDPOINT: 'https://logto.sunnypilot.ai',
    PUBLIC_LOGTO_APP_ID: 'test-app-id'
}));

// Mock @logto/browser
const { signInMock } = vi.hoisted(() => {
    return { signInMock: vi.fn() };
});

vi.mock('@logto/browser', () => {
    return {
        default: class {
            constructor() { }
            signIn = signInMock;
            isAuthenticated = vi.fn().mockResolvedValue(false);
        }
    };
});

// Mock $app/environment
vi.mock('$app/environment', () => ({
    browser: true
}));

// Import the function to test
// Note: We need to import AFTER mocks are defined (Vitest hoists mocks typically, but good practice)
import { initiateLogin } from './auth.svelte';

describe('initiateLogin', () => {
    const originalWindow = global.window;
    const originalDocument = global.document;

    beforeEach(() => {
        signInMock.mockClear();

        // Custom window mock
        // @ts-ignore
        global.window = {
            location: {
                origin: 'http://localhost:5173',
                href: 'http://localhost:5173/page',
                protocol: 'http:',
            }
        };

        // Custom document mock
        let cookieStore = '';
        // @ts-ignore
        global.document = {
            get cookie() { return cookieStore; },
            set cookie(val: string) {
                // Simple append-like behavior for mocking, or just replacement
                // For this test we only set one cookie, so replacement is fine for checking content
                cookieStore = val;
            }
        };
    });

    afterEach(() => {
        global.window = originalWindow;
        global.document = originalDocument;
        vi.unstubAllGlobals();
    });

    it('should use normal sign in flow on localhost', async () => {
        global.window.location.origin = 'http://localhost:5173';
        global.window.location.href = 'http://localhost:5173/page';

        await initiateLogin();

        expect(signInMock).toHaveBeenCalledWith('http://localhost:5173/auth/callback');
        // Cookie should not be set (or at least not contain our specific key)
        expect(global.document.cookie).not.toContain('netlify_preview_url');
    });

    it('should use normal sign in flow on production', async () => {
        global.window.location.origin = PRODUCTION_URL;
        global.window.location.href = `${PRODUCTION_URL}/page`;
        global.window.location.protocol = 'https:';

        await initiateLogin();

        expect(signInMock).toHaveBeenCalledWith(`${PRODUCTION_URL}/auth/callback`);
        expect(global.document.cookie).not.toContain('netlify_preview_url');
    });

    it('should redirect to production callback on preview environment', async () => {
        const previewUrl = 'https://deploy-preview-123--sunnylink.netlify.app';
        global.window.location.origin = previewUrl;
        global.window.location.href = `${previewUrl}/dashboard`;
        global.window.location.protocol = 'https:';

        await initiateLogin();

        // Should call signIn with PRODUCTION callback
        expect(signInMock).toHaveBeenCalledWith(`${PRODUCTION_URL}/auth/callback`);

        // Should set cookie
        expect(global.document.cookie).toContain('netlify_preview_url=https%3A%2F%2Fdeploy-preview-123--sunnylink.netlify.app%2Fdashboard');
        expect(global.document.cookie).toContain('SameSite=Lax');
        expect(global.document.cookie).toContain('Secure');
    });
});
