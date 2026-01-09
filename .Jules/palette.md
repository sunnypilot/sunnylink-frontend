## 2025-05-23 - Accessibility Roles for Toasts
**Learning:** Toast notifications often get missed by screen readers if they lack `role="alert"` or `role="status"`. `role="alert"` is assertive (interrupts), suitable for errors. `role="status"` is polite (waits), suitable for success/info.
**Action:** Always verify that dynamic notifications have appropriate ARIA roles based on their urgency.
