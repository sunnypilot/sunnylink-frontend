import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';
import { authState, logtoClient } from '$lib/logto/auth.svelte';
import { tick } from 'svelte';

vi.mock('$lib/logto/auth.svelte');

describe('/+page.svelte', () => {
	it('should render h1', async () => {
		render(Page);
		const heading = page.getByRole('heading', { level: 1 });
		await expect.element(heading).toBeInTheDocument();
	});

	it('should call signIn when the user is not authenticated', async () => {
		render(Page);
		const signInButton = page.getByText('Sign in via sunnylink');
		await signInButton.click();
		expect(logtoClient.signIn).toHaveBeenCalled();
	});

	it('should show the dashboard button when the user is authenticated', async () => {
		authState.set({ isAuthenticated: true });
		render(Page);
		await tick();
		const dashboardButton = page.getByText('Go to sunnylink Dashboard');
		await expect.element(dashboardButton).toBeInTheDocument();
	});
});
