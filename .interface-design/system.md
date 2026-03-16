# sunnylink Design System

## Direction
Quiet instrument panel. Dense enough to be useful, spacious enough to breathe.
The interface feels like sitting in a well-designed cockpit — every control is reachable,
nothing is noisy, status is ambient.

## Primary Color
#594AE2 (light), #7C6FEB (dark)

## Depth Strategy
**Borders-only.** One level: page background → card surface.
Cards get a single subtle border. No shadows. Interior rows separated by hairline dividers.

## Surfaces
- Page: #f8f7fc (light), #0c0b14 (dark)
- Card/Surface: #ffffff (light), #151420 (dark)
- Elevated: #f3f1fe (light), #1f1e2c (dark)
- Input: #eeedf5 (light), #1f1e2c (dark)

## Dark Mode Contrast (WCAG-tuned)
- text-1 (#e4e3f0) vs surface: ~12:1 ratio
- text-2 (#a09eb5) vs surface: ~7:1 ratio
- text-3 (#8a87a0) vs surface: ~5.5:1 ratio
- border (#353347) vs surface: ~3:1 ratio
- Toggle knob: #f0eef8 (soft off-white, no OLED bloom)

## Typography
- System font stack (Inter if available)
- Settings title: 14px/0.875rem medium (500)
- Description: 13px/0.8125rem regular (400) in text-2
- Section header: 11px/0.6875rem uppercase tracking-wide (600) in text-3
- Page heading: 20px/1.25rem semibold (600)
- Brand: Audiowide, uppercase, tracking 0.35em

## Spacing
- Base unit: 4px
- Card padding: 16px (px-4 py-4)
- Row padding: 12px vertical (py-3)
- Section gap: 24px (space-y-6)
- Divider: 1px border-muted, full-bleed within card padding

## Border Radius
- Cards: 12px (rounded-xl)
- Buttons/inputs: 8px (rounded-lg)
- Toggles: full (rounded-full)
- Segmented buttons: 6px (rounded-md)

## Controls
- Toggle: 36x20px pill, 14x14px knob
- Slider: thin track (h-1.5), primary thumb
- Segmented: compact pill group, primary fill on active, ghost on inactive
- Select: custom styled with bg-input

## Component Patterns

### Grouped Section Card
Settings are grouped into a SINGLE unified card per panel. Items and sub-panel
navigation live together. Items separated by hairline dividers (border-muted).
A heavier divider (border) separates items from sub-panel navigation rows.

```
┌─ Unified Card ─────────────────────────┐
│ Setting Title          [toggle]        │
│ Description text                       │
│╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│
│ Setting Title          [toggle]        │
│╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│
│ Setting Title          [select ▾]      │
│──────────────────────────────────────── │ ← heavier divider
│ Sub-panel A                       ›    │
│╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│
│ Sub-panel B                       ›    │
└────────────────────────────────────────┘
```

### Sidebar
Same background as page. Tighter nav items. Active item has left accent bar (3px primary).
Collapsible sections: Device, Settings, Tools, Account.

### Status Indicators
- Push success: emerald-500 left border accent on the row (1.5s fade)
- Push error: red-500 left border accent + inline error text
- Pushing: opacity-60 + small spinner next to title
- Disabled: opacity-40 (clearly distinct from enabled-but-OFF)
- Offroad badge: amber pill, compact

### Toggle States (iOS 17/18 Style)
- Size: h-[1.9rem] w-[3.25rem] (~30x52px) — iOS proportions
- Knob: h-[1.55rem] w-[1.55rem] (~25x25px), #f0eef8 (soft off-white)
- ON: primary fill track, knob translated right
- OFF: border-color track (visible in both modes), knob left
- Disabled: opacity-40 on entire row
- Blocked by push: dependent items disabled while a related setting is being pushed

### Row Spacing
- Toggle/option/segmented/info rows: py-4 (16px each side, ~48px+ total)
- Sub-panel nav rows: py-4
- Hairline dividers: mx-4 border-[var(--sl-border-muted)]

### Dependent Setting Locking
- pushStateStore tracks which param keys are being pushed per device
- Items whose enablement rules reference a currently-pushing param are auto-disabled
- collectParamDependencies() extracts param keys from rule trees
- Push state: startPush on send, endPush on success or error

### Page Headers
- Title only (18px/text-lg semibold), no device subtitle
- Device identity shown in header DeviceSelector, not repeated
- Loading: small spinner inline with title (not percentage text)

### Account Menu (Popover)
- Triggered by user profile button at sidebar bottom
- Opens upward (bottom-full) with bg-elevated surface + border
- Contains: user identity, theme selector (segmented), Preferences, Support, Log out
- Closes on click-outside or Escape
- Theme selector: 3-option segmented (Light/Dark/System) with icons
- Log out: text-2 → red-400 on hover
- Support, Preferences, Logout NO LONGER in sidebar nav — only in account popover

## Navigation
- Active: left-3px primary accent bar + bg-elevated/50 + text-1
- Hover: bg-elevated/30 + text-1
- Idle: transparent + text-2
- Section headers: uppercase text-3 with tracking-wide

## Animations
- Transitions: 150ms ease
- Toggle: 200ms transform
- Push feedback: 150ms border-color transition
- Theme switch: 150ms background/color
