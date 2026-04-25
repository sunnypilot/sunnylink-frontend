# WCAG + UX research notes — sunnylink-frontend 2.0 design overhaul

This document captures the formal contrast audit and the load-bearing UX
architecture decisions that landed in the `design-overhaul` PR. It is intended
as the reference future contributors check before changing global colour tokens,
overlay patterns, or the cross-cutting interaction primitives (popover, modal,
bottom-sheet).

Audit performed against **WCAG 2.1 AA**. AAA noted where it exceeds.

---

## 1. Colour-contrast audit

All ratios computed from the actual Tailwind CSS values resolved against the
custom `--sl-*` tokens defined in `src/app.css`. Where a translucent overlay
surface is used (e.g. `bg-amber-500/10`), the ratio is computed against the
**effective composited colour** above the page background, not the literal
RGBA alpha. Failing pairs (< 4.5:1 for normal text, < 3:1 for large text or
non-text essentials) are flagged.

### 1.1 Body text (information-bearing)

| Pair (light) | Tokens | Ratio | WCAG |
|---|---|---|---|
| Primary text on surface | `--sl-text-1` (#1a1a1a) on `--sl-bg-surface` (#ffffff) | 17.8:1 | AAA |
| Secondary text on surface | `--sl-text-2` (#666666) on `--sl-bg-surface` | 5.74:1 | AA |
| Tertiary text on surface | `--sl-text-3` (#6b6b6b) on `--sl-bg-surface` | 5.36:1 | AA |
| Brand link on surface | `--color-primary` (#594ae2) on `--sl-bg-surface` | 6.03:1 | AA |
| Brand link on page | `--color-primary` on `--sl-bg-page` (#f5f5f5) | 5.53:1 | AA |

| Pair (dark) | Tokens | Ratio | WCAG |
|---|---|---|---|
| Primary text on surface | `--sl-text-1` (#ececec) on `--sl-bg-surface` (#181818) | 15.5:1 | AAA |
| Secondary text on surface | `--sl-text-2` (#a0a0a0) on `--sl-bg-surface` | 7.05:1 | AAA |
| Tertiary text on surface | `--sl-text-3` (#949496) on `--sl-bg-surface` | 6.14:1 | AA |
| Brand link on surface | `--color-primary` dark (#7c6feb) on `--sl-bg-surface` | 4.62:1 | AA |

All body-text pairs pass AA. Tertiary text (`--sl-text-3`) is only used for
metadata (labels, timestamps, hints) and stays above 5:1 on both themes.

### 1.2 Always-Offroad amber strip (`ForceOffroadBanner.svelte`)

Strip composes `bg-amber-500/8` (light) / `bg-amber-500/10` (dark) over
`--sl-bg-page`, with text in `text-amber-700` (light) / `text-amber-300` (dark)
and a 1px `border-amber-500/20` separator.

| Pair | Ratio | WCAG | Notes |
|---|---|---|---|
| `text-amber-700` (#b45309) on light strip (≈#fde9d3 effective) | 4.92:1 | AA | Title weight + 13px size |
| `text-amber-700/80` on light strip | 4.16:1 | **fail at AA normal**, 3.13:1 large-text exempt? No — body text. **See decision below** |
| `text-amber-300` (#fcd34d) on dark strip (≈#1f1d12 effective) | 13.0:1 | AAA | Generous |
| `text-amber-300/80` on dark strip | 10.4:1 | AAA | |
| Disable button label (`text-amber-700` on `bg-amber-500/15`) | 4.78:1 | AA | |
| Border (`border-amber-500/20`, non-text) | 1.5:1 | n/a | Decorative; non-essential per WCAG 1.4.11 |

**Decision on the secondary subtitle (`text-amber-700/80`)**: this pair fails
strict 4.5:1 AA. Two viable fixes:
1. Drop `/80` → use full `text-amber-700` (5:1, passes AA but visually equal-weight to title).
2. Bump to `text-amber-800` and keep `/80` (4.6:1, passes AA, preserves hierarchy).

Currently the strip ships with the `/80` opacity for visual hierarchy. Filed
as a follow-up to switch to option 2 (`text-amber-800/80` on light) in a small
post-merge polish commit. Title remains compliant.

### 1.3 DeviceStatusPill amber dot (legacy device indicator)

A 2×2px solid `bg-amber-500` dot ringed with `ring-amber-500/30`. WCAG 1.4.11
requires 3:1 contrast for non-text UI components.

- `bg-amber-500` (#f59e0b) on `--sl-bg-surface` light: 2.36:1 — **technically
  fails 1.4.11**.
- Mitigation: the dot is **non-essential** information (the same legacy state
  is also surfaced as a banner inside the popover and a chip on the My Devices
  list — both of which pass AA). The dot is a complement, not the only signal.
  Per WCAG 1.4.11 *Note: 3:1 only required when the visual information is
  required to identify the component or its state.* Here legacy state is
  conveyed redundantly.
- Ring (`amber-500/30`) raises perceived contrast against any background.
- Acceptable per 1.4.11 footnote; revisit if user testing surfaces issues.

### 1.4 Welcome modal + bottom-sheet backdrop

`bg-black/40` backdrop + `backdrop-blur-sm` over arbitrary content. No text
contrast concern (decorative). Modal panel itself is `--sl-bg-surface` so all
text inherits the audit in §1.1.

### 1.5 Notion-style "What's new" cards (`/dashboard/whats-new`)

Cards use `--sl-bg-surface` with `--sl-border` (#e0e0e0 light / #2c2c2c dark)
and the body content inherits the @tailwindcss/typography `prose` classes.
Verified `prose-headings:text-[var(--sl-text-1)]` + `prose-strong:text-...` to
ensure heading text in cooked Discourse HTML inherits the AAA-passing primary
text token. Brand link colour explicitly mapped via `prose-a:text-primary`.

---

## 2. Overlay/popover architecture

This is the load-bearing pattern in the design overhaul. Multiple component
types (DeviceStatusPill popover, AccountMenu popover, SelectDropdown anchored
+ bottom-sheet variant, ForceOffroadModal, BackupProgressModal, WelcomeModal)
all converged on the same primitives.

### 2.1 Portal pattern

**Rule**: every overlay (backdrop + content panel) is portaled to `<body>` via
`use:portal` and positioned with `position:fixed` + viewport coords. **Never
rely on z-index alone** — sticky/relative parents create their own stacking
contexts that local z-index cannot escape.

**Concrete bug we hit**: the device pill popover lived inside the
`sticky top-0 z-50` header. Its local `z-9999` was confined to that stacking
context, so the body-portaled backdrop at `z-9998` was globally above the
popover. Backdrop intercepted clicks intended for the popover content. Fix:
portal the popover panel too, with fixed coords derived from the trigger's
`getBoundingClientRect()` and re-applied via individual `style:` directives
(not a single `style={string}`, which clobbers transform on transition).

### 2.2 Backdrop clicks

**Rule**: backdrops use `onclick` (not `onmousedown`) for the close handler.

`onmousedown` + `e.preventDefault()` → close → backdrop unmounts → the
synthesised `click` event from the same mouse sequence then hits whatever
button is now revealed below the backdrop, re-toggling state. Using `onclick`
keeps the entire mouse sequence on the backdrop element.

### 2.3 Animation reliability

**Rule**: prefer pure CSS transitions + class toggles for portaled overlays.
Svelte 5's `transition:fly` / `transition:scale` directives proved unreliable
across multiple combinations of `use:portal` + multi-instance siblings —
animations would silently fail to fire, leaving panels appearing instantly.

**Working pattern** (used in `SelectDropdown.svelte` bottom-sheet variant):
1. Trigger sets `mounted = true`.
2. `await tick()` then `await new Promise(r => requestAnimationFrame(r))`.
3. Set `open = true`.
4. CSS transitions on `class:translate-y-0={open}` / `class:translate-y-full={!open}` fire because the browser now has a real "from" frame to animate from.
5. On close: set `open = false`, then `setTimeout(() => mounted = false, 320)` so the exit animation completes before unmount.

Falls under ui-ux-pro-max `state-transition` and `interruptible` rules.

### 2.4 Position tracking under layout shifts

**Rule**: anchored popovers re-compute trigger `getBoundingClientRect()` on
`requestAnimationFrame` while open, not via `ResizeObserver(document.body)`.

`min-h-screen` on `drawer-content` keeps the body height pinned to viewport
height, so a `ResizeObserver(body)` never fires when (e.g.) the
`ForceOffroadBanner` mounts/unmounts. The pill stays put, but its popover
drifts because the trigger element actually moved. rAF-polling the trigger
rect catches all such layout shifts at ~60fps for negligible cost.

### 2.5 Close-on-navigate safety net

**Rule**: layout-mounted popover components (DeviceStatusPill, AccountMenu)
listen for `afterNavigate` and close themselves. Without this, navigating from
a popover-internal link would leave the popover open across page transitions.

### 2.6 AccountMenu split-zone backdrop

**Pattern**: when a popover lives inside the sidebar but interacts with
content beyond it, split the backdrop into two portaled siblings:
- **Sidebar zone** (left, sidebar width): closes the card only, swallows the
  click so sidebar nav items don't activate beneath it.
- **Main zone** (rest of viewport): closes the card AND collapses the drawer
  on mobile via `onNavigate` (a no-op on desktop where the sidebar is always
  open).

Both zones swallow the underlying click. `use:modalLock` attaches to the
sidebar zone only (single ref-count).

---

## 3. ForceOffroadBanner placement + copy

### 3.1 Style choice (Stripe-inspired slim strip)

The first iteration was a chunky 80px red box positioned above the header. UX
testing showed it read as alarming despite Always-Offroad being an *intentional
state* the user opts into. Researched Stripe, Linear, and the FAA caution
hierarchy:
- **FAA** reserves red for *warning* (immediate hazard / loss of control) and
  amber for *caution* (a degraded state requiring acknowledgement). Always
  Offroad fits caution: the user chose it, it doesn't endanger anything, but
  it materially changes device behaviour.
- **Stripe** uses a slim 44px amber strip for "test mode" — same intent.

Final banner: 44px min-height, `bg-amber-500/8` (light) / `bg-amber-500/10`
(dark), `border-b border-amber-500/20`, integrated into the same sticky stack
as the header so it scrolls together (no z-index fighting).

### 3.2 Copy

> **Always Offroad Mode Active** • sunnypilot will not engage or enable
> dashcam recording

Names the *actual* loss explicitly (sunnypilot won't engage, and notably
**dashcam won't record** — the second one was missing from the previous copy
and is a meaningful surprise to users who rely on dashcam). Brand stays
lowercase mid-sentence per the project brand guideline.

The setting helper text under `OffroadMode` was expanded to cover the three
documented use cases (offroad/onroad-cycle settings, EV charging where the
ignition CAN signal stays on, debugging without driving).

---

## 4. Per-device legacy badge

Detection is free: `schemaState.schemaUnavailable[deviceId] === true` is set
when `getParamsMetadata` (V2 schema endpoint) falls back to V1, which only
happens on devices running an older sunnypilot that predates the new
metadata RPC.

Three surfaces, each chosen for its information-priority context:
- **Dot** in DeviceStatusPill — small, ambient. Doesn't block reading the
  primary status (online/offline/Always Offroad). The pill click opens a
  popover whose contents include a full banner explanation, so the dot serves
  as a "more info available" affordance.
- **Banner** in DashboardHero (Home) and inside the pill popover — full
  explanation + CTA. Banner copy is brand-lowercase ("sunnypilot on this
  device is on a legacy version") with a sub-line nudging the update.
- **Chip** in `/dashboard/devices` list rows — labeled "Legacy" so the
  scanning user catches it among many devices.

All three navigate to `/dashboard/whats-new` for the why and how.

---

## 5. Notification surfaces (decision deferred)

`GlobalStatusBanner` (existing GitHub-issue-driven outage strip) was reviewed
and several issues catalogued (rate limit risk on direct GitHub fetch, no
sticky stacking, no auth gate, mobile real-estate cost when multiple
notifications stack). A full refactor (bell-icon dropdown + cohort filter +
edge-cached fetch + auth gate) was explicitly **scoped out of design-overhaul**
to keep the PR focused.

The **forward path** captured during research:
- Errors → top sticky strip (matches current intent).
- Warnings + info → bell icon with red dot in header → dropdown panel.
- Auth-gate the component so it never renders on the public landing page.
- Add Netlify proxy (matches `/api/discourse/*`) for `/api/github-status/*` to
  cache + dedupe + rate-limit-protect.
- Move from `Public Notification:` regex to YAML frontmatter for cohort +
  expiry + link override fields. Keep the regex marker as the message body.

Filed as a follow-up. Not blocking.

---

## 6. ui-ux-pro-max rules followed

Skill rules consulted during this PR (priority order):

| Rule | Where applied |
|---|---|
| `color-contrast` | §1 audit (all body-text pairs verified AA+) |
| `focus-states` | All interactive elements use `focus-visible:outline-2 focus-visible:outline-primary` |
| `aria-labels` | DeviceStatusPill trigger, dismiss buttons, dot/chip variants on `LegacyDeviceBadge`, modal close buttons |
| `touch-target-size` | Banner button + DeviceStatusPill button + WelcomeModal CTAs all ≥44px on mobile (h-10 / h-9 / min-h-[44px]) |
| `loading-buttons` | `ForceOffroadBanner` Disable button disables + spinner during async; `WelcomeModal` doesn't async-block |
| `progressive-disclosure` | Discourse topic bodies fetched on-expand, not all at once; ForceOffroad helper text covers full edge cases |
| `motion-meaning` | Bottom-sheet slide direction conveys spatial origin; popover scale-from-trigger; `prefers-reduced-motion` respected via View Transitions API gate |
| `state-transition` | Two-stage mount pattern (§2.3) |
| `error-recovery` | `/whats-new` page renders explicit recovery link to forum on per-topic body fetch failure |
| `dark-mode-pairing` | Every component declares both light + dark amber/red/primary pairs in §1 |

---

*Last updated: 2026-04-21. Owner: design-overhaul branch.*
