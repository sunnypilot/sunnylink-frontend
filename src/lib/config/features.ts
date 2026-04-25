// Feature toggles — flip to `true` to re-enable a surface.
//
// `whatsNewRoute` gates the /dashboard/whats-new/* pages and the nav link.
// When off, the route layout redirects to /dashboard.
//
// `notificationBell` gates the topbar bell icon and its dropdown.
//
// `faviconBadge` gates the red-dot favicon painter. Independent of the bell
// so you can ship the bell UI without the favicon mutation if needed.
//
// `legacyUi` gates every "legacy sunnylink" surface: top banner,
// device-card chip, status-pill dot, dashboard hero banner, and the
// LegacyInfoModal. One flag because these always ship together.
export const FEATURES = {
	whatsNewRoute: false,
	notificationBell: false,
	faviconBadge: false,
	legacyUi: false
} as const;
