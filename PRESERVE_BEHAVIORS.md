# Preserve These Behaviors

Last reviewed: 2026-04-16

## Why This Document Exists

This codebase is hard to love structurally, but some of its product behavior is genuinely worth keeping.

The goal of a rewrite should not be to preserve the current implementation. It should be to preserve the guarantees the current app gives users:

- settings appear quickly
- settings stay mostly correct even with flaky device connectivity
- device-side schema drives frontend behavior
- online writes feel immediate
- offline writes are not lost
- the app notices when the device changed something behind the UI's back

This doc explains the important behaviors at a high level so we can rebuild them more cleanly.

## Preserve These Concepts

1. Schema-driven settings contract
2. Stale-while-revalidate settings and schema cache
3. Online optimistic batched writes with readback verification
4. Offline desired-state queue
5. Drift detection
6. Freshness and invalidation model
7. Backup filtering and migration behavior

## 1. Schema-Driven Settings Contract

### What it is today

The frontend is moving away from a giant static settings file and toward a device-provided settings schema.

Core files:

- [src/lib/types/schema.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/types/schema.ts)
- [src/lib/stores/schema.svelte.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/stores/schema.svelte.ts)
- [src/lib/components/schema/SchemaPanel.svelte](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/components/schema/SchemaPanel.svelte)
- [src/lib/components/schema/SchemaItemRenderer.svelte](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/components/schema/SchemaItemRenderer.svelte)
- [src/lib/rules/evaluator.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/rules/evaluator.ts)
- [src/lib/api/device.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/api/device.ts)

The device schema describes:

- panels
- sections
- sub-panels
- widget type
- title/description
- options
- units
- min/max/step
- visibility rules
- enablement rules
- capabilities
- brand-specific vehicle settings

The frontend uses that schema to decide:

- what to show
- what to disable
- why something is disabled
- which controls to render
- which vehicle-specific options apply

### Why it exists

Without this, the frontend has to hardcode the device's product model.

That is brittle because:

- device features change over time
- different devices/vehicles expose different capabilities
- enablement depends on runtime conditions like offroad state

The schema lets the device be the source of truth for settings behavior.

### Behavior worth preserving

- The frontend should not hardcode most settings layout or enablement rules.
- The device should be able to add, hide, disable, or annotate settings without a frontend rewrite.
- Capabilities should travel with the schema and affect rendering.
- Vehicle-brand-specific settings should fit the same model instead of becoming a separate UI system.

### How we can do better

Keep the schema contract, but simplify the implementation:

- Move schema fetching and parsing into a dedicated service.
- Treat schema as a versioned domain object, not a mutable global singleton.
- Make rendering components thinner by giving them already-resolved view models.
- Delete the legacy static fallback once device support policy allows it.

## 2. Stale-While-Revalidate Cache

### What it is today

The app tries to show something immediately, then fix it in the background.

Core files:

- [src/lib/stores/valuesCache.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/stores/valuesCache.ts)
- [src/lib/stores/schema.svelte.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/stores/schema.svelte.ts)
- [src/routes/dashboard/settings/+layout.svelte](/Users/ibpersonal/dev/sunnylink-frontend/src/routes/dashboard/settings/+layout.svelte)

For values:

- cached in `localStorage`
- keyed by `deviceId + GitCommit`
- `lastKnownCommit` is stored separately to break the bootstrapping problem

For schema:

- cached in `localStorage`
- keyed by `deviceId + GitCommit`
- background revalidation updates only if the structure changed

Settings pages then:

- hydrate cached values immediately
- render from cache if available
- fetch fresh values in the background
- update caches when fresh data arrives

### Why it exists

Device connections are not fast enough to make a cold request on every page transition feel good.

The cache gives:

- fast page loads
- fewer empty/skeleton states
- resilience when the device is offline

The `GitCommit` key matters because a software update can change the meaning or availability of settings.

### Behavior worth preserving

- Known values should render instantly after refresh or navigation.
- Fresh values should replace cached ones in the background.
- A software update should invalidate stale cache automatically.
- Schema and values should not be cached forever without versioning.

### How we can do better

- Use a proper query/cache layer instead of hand-rolled `localStorage` patterns everywhere.
- Centralize cache policy instead of re-implementing it per feature.
- Make the cache boundary explicit: boot cache, memory cache, persisted cache.
- Use a single data service to decide when stale data is acceptable.

## 3. Online Optimistic Batched Writes

### What it is today

When the device is online, the app does not write every setting immediately.

Core file:

- [src/lib/stores/batchPush.svelte.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/stores/batchPush.svelte.ts)

The current behavior:

1. User changes a setting.
2. UI updates optimistically right away.
3. The change is queued per device.
4. Writes debounce for 4 seconds.
5. All pending keys flush as one `setDeviceParams()` call.
6. The app then reads those keys back using the fast async read API.
7. If the device value matches, the write is confirmed.
8. If the device reports a different value than both the desired value and the previous value, the device wins and the UI rolls back.

Important details:

- If the user reverts back to the original value before flush, the pending write is canceled entirely.
- Definite failures like local network failure or explicit device rejection roll back.
- Timeouts and uncertain server failures are treated optimistically, then corrected later by refresh/drift.
- After success, capabilities are refreshed because some toggles change what else should be enabled.

### Why it exists

This avoids three common bad experiences:

- laggy settings UI
- a flood of write requests while dragging/toggling
- stale enablement logic after a setting changes capabilities

It also acknowledges that writes to remote devices are slow and sometimes ambiguous.

### Behavior worth preserving

- User actions should feel immediate.
- Rapid changes should collapse into fewer writes.
- The system should verify writes instead of assuming success.
- The device is the final source of truth in conflicts.
- Dependent settings should update after a write changes capabilities.

### How we can do better

- Move this into an explicit write engine, not a store file.
- Model writes as commands with lifecycle and telemetry.
- Separate transport uncertainty from domain conflict handling.
- Add tests around rollback, conflict, and debounce behavior.

## 4. Offline Desired-State Queue

### What it is today

If the device is offline, the app does not just disable everything and lose intent. It stores desired changes locally and syncs them later.

Core files:

- [src/lib/stores/pendingChanges.svelte.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/stores/pendingChanges.svelte.ts)
- [src/routes/dashboard/settings/+layout.svelte](/Users/ibpersonal/dev/sunnylink-frontend/src/routes/dashboard/settings/+layout.svelte)

Each pending change stores:

- key
- desired value
- previous value
- timestamp
- attempts
- status

Statuses today:

- `pending`
- `pushing`
- `confirmed`
- `failed`
- `blocked_onroad`

Important behavior:

- queue persists in `localStorage`
- if user changes back to the original value, the pending entry is removed
- queued changes auto-flush when the device reconnects
- offroad-only settings are blocked while the device is driving, then retried when the device goes offroad

### Why it exists

This app is remote control software for intermittently reachable devices. Users still need to express intent even when the device is unavailable.

That means the real model is not "immediate write" but "desired state eventually applied to device."

### Behavior worth preserving

- Offline edits should not be silently lost.
- Users should be able to see what is queued.
- The queue should survive refresh/browser restart.
- Offroad-only constraints should apply to queued writes too, not just live UI.
- Reconnect should automatically attempt sync.

### How we can do better

- Make this a first-class desired-state sync subsystem.
- Unify its state model with the online write path so there is one write lifecycle.
- Treat blocked-onroad as policy, not ad hoc UI behavior.
- Add a clearer queue inspector in the UI instead of scattering badges and small indicators.

## 5. Drift Detection

### What it is today

The app compares what it last knew against what the device now says, and surfaces meaningful differences.

Core files:

- [src/lib/utils/drift.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/utils/drift.ts)
- [src/lib/stores/driftStore.svelte.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/stores/driftStore.svelte.ts)
- [src/routes/dashboard/settings/+layout.svelte](/Users/ibpersonal/dev/sunnylink-frontend/src/routes/dashboard/settings/+layout.svelte)

Today the flow is:

1. Capture a baseline snapshot from cached values.
2. Background prefetch fetches fresh values.
3. Compare fresh values to the baseline.
4. Ignore differences that match the user's own pending desired value.
5. Keep the rest as drift entries.
6. Annotate drift entries with panel/section/item metadata so the UI can explain where the drift happened.

In plain English:

- if the device changed something on its own, tell the user
- if the change was actually the user's queued intention, do not call it drift

### Why it exists

This is an important remote-management behavior. The web UI is not the only writer.

Possible sources of change:

- device-local UI
- firmware behavior
- a previous write finally applying
- another actor changing settings

Without drift detection, the web app can look correct while being wrong.

### Behavior worth preserving

- The system should notice when device state changed behind the UI's back.
- It should distinguish between genuine drift and expected convergence.
- Drift should be tied to human-meaningful settings metadata.

### How we can do better

- Treat drift as a formal comparison between baseline, desired state, and observed state.
- Make the baseline explicit and testable.
- Use domain events instead of mutating drift state from a layout file.
- Add clear UX for review/accept/reload if needed.

## 6. Freshness and Invalidation Model

### What it is today

The app has two separate freshness ideas:

1. Is the device reachable?
2. Are our cached values still current?

Core files:

- [src/lib/stores/statusPolling.svelte.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/stores/statusPolling.svelte.ts)
- [src/lib/stores/versionPoller.svelte.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/stores/versionPoller.svelte.ts)
- [src/routes/dashboard/settings/+layout.svelte](/Users/ibpersonal/dev/sunnylink-frontend/src/routes/dashboard/settings/+layout.svelte)

`statusPolling`:

- adaptively polls device reachability
- slows down when the user is idle
- backs off on failures
- refreshes when the tab becomes visible again

`versionPoller`:

- polls `ParamsVersion`
- marks values stale when it changes
- triggers global settings revalidation

This is a good distinction:

- reachability is not the same thing as freshness

### Why it exists

The device can stay online while values become outdated.

That means:

- online does not imply current
- current does not imply online

### Behavior worth preserving

- Reachability and freshness should be separate signals.
- The UI should revalidate after device-side config changes.
- Polling should adapt to visibility and idle state.

### How we can do better

- Model freshness centrally in the data layer.
- Replace route-local invalidation flags with query invalidation.
- Use one polling coordinator rather than multiple feature-specific loops.

## 7. Backup and Migration Behavior

### What it is today

The app has a real backup model, not just "dump everything."

Core files:

- [src/lib/utils/settings.ts](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/utils/settings.ts)
- [src/lib/components/SettingsMigrationWizard.svelte](/Users/ibpersonal/dev/sunnylink-frontend/src/lib/components/SettingsMigrationWizard.svelte)
- [src/routes/dashboard/+page.svelte](/Users/ibpersonal/dev/sunnylink-frontend/src/routes/dashboard/+page.svelte)

Important backup behavior:

- use device-reported keys when available
- otherwise fall back to static definitions
- exclude heavy cache data, ephemeral runtime state, hardware/device-specific values, updater state, and live telemetry
- fetch in chunks with concurrency
- retry failures
- generate deterministic output ordering
- record unavailable keys separately

This is smarter than it looks.

### Why it exists

A naive backup would be dangerous because many params are:

- device-specific
- temporary
- regenerated automatically
- not user configuration

### Behavior worth preserving

- Backups should represent portable user configuration, not raw device internals.
- Restore/migration should be resilient to missing keys and version differences.
- Output should be deterministic and inspectable.

### How we can do better

- Move backup policy into an explicit allowlist/denylist data model.
- Version the backup format more formally.
- Separate export policy from UI workflow.

## What Not To Preserve

These are implementation details we should feel free to replace:

- giant singleton stores as the system boundary
- route layouts as orchestration hubs
- huge components owning async workflows
- schema, cache, write, and drift behavior being spread across unrelated files
- duplicated fetch/decode/cache logic in settings, models, OSM, and vehicle pages

## A Better Rewrite Shape

The better version should preserve the same behaviors with cleaner ownership:

- `SchemaService`
  Handles schema fetch, caching, capabilities refresh, fallback policy

- `SettingsQueryService`
  Handles params reads, SWR cache, freshness, invalidation

- `SettingsWriteService`
  Handles optimistic writes, batching, verification, rollback

- `DesiredStateQueueService`
  Handles offline intent, reconnect sync, blocked-onroad policy

- `DriftService`
  Handles baseline capture, comparison, suppression of expected drift

- `BackupService`
  Handles portable export/import policy

Then the UI layer just:

- renders current state
- dispatches user intent
- subscribes to feature-specific view models

## The Rewrite Rule

If a new architecture cannot clearly answer these questions, it is not better yet:

1. What happens when the user changes a setting while the device is online?
2. What happens when they do the same thing while the device is offline?
3. How do we know whether what we are showing is stale?
4. How do we know whether the device accepted the write?
5. How do we detect the device changed something without us?
6. How do we avoid showing stale values after a software update?

If the rewrite preserves those answers while drastically simplifying ownership, then yes, we did better.
