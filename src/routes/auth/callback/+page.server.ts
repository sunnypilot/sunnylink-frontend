import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, cookies }) => {
    const previewUrl = cookies.get('netlify_preview_url');

    if (previewUrl) {
        // Clear the cookie so we don't get stuck in a loop
        // We set path '/' and correct domain/secure attributes implicitly or explicitly
        cookies.delete('netlify_preview_url', { path: '/' });

        // Construct the redirect URL
        // We want to send the user back to the preview URL, but with the same query parameters
        // that Logto sent us (code, state, etc.)
        const targetUrl = new URL(previewUrl);

        // Append search params from the current callback to the target URL
        url.searchParams.forEach((value, key) => {
            targetUrl.searchParams.set(key, value);
        });

        // Redirect to the preview URL
        redirect(302, targetUrl.toString());
    }

    // If no preview URL is stored, we just render the page normally.
    // The client-side code will handle the Logto callback.
    return {};
};
