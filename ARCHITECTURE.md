# Architecture

Last updated: 2026-04-16

## Purpose

This is the high-level architecture reference for humans and agents working in this repo.

Use this file to answer:

- what this app is
- which behaviors are worth preserving
- where the current design is weak
- what target architecture new work should move toward

Supporting docs:

- `CODEBASE_AUDIT.md`: broad assessment of strengths, weaknesses, and rewrite rationale
- `PRESERVE_BEHAVIORS.md`: high-level explanation of the important behavior to keep

## What This App Is

`sunnylink` is a browser-first remote management client for comma devices running sunnypilot.

It is not a normal CRUD dashboard. It is closer to a remote-control and sync client with these constraints:

- devices may be offline
- device writes are slow and sometimes ambiguous
- device state can change outside the web UI
- frontend behavior depends on device capabilities, vehicle brand, and offroad state
- cached values are necessary for good UX

Core user-facing features:

- device list and device selection
- online/offline/offroad status
- schema-driven settings UI
- online optimistic settings writes
- offline queued settings writes
- drift detection
- model browsing and switching
- vehicle fingerprint/platform management
- OSM region management
- backup and migration

## Runtime Model

Today this app is effectively a client-side SPA delivered through SvelteKit.

Important facts:

- `ssr = false` on the meaningful routes
- auth runs in the browser
- device fetching and polling run in the browser
- settings cache and desired-state queue live in `localStorage`
- most business logic currently lives in route/layout files, stores, and large components

## Current Architecture Map

### Entry and shell

- `src/routes/+layout.svelte`
  App shell, navigation, device bootstrap, polling startup, global banners, modals

- `src/routes/+layout.ts`
  Device list load entry point

- `src/routes/+page.svelte`
  Marketing/landing page

### API and auth

- `src/lib/logto/auth.svelte.ts`
  Browser auth singleton

- `src/lib/api/client.ts`
  OpenAPI clients and custom fetch wrapper

- `src/lib/api/device.ts`
  Device API calls plus major orchestration logic

### Global stores

- `src/lib/stores/device.svelte.ts`
  Main global state holder for selected device, values, aliases, backup, migration, telemetry, etc.

- `src/lib/stores/schema.svelte.ts`
  Schema and capabilities cache

- `src/lib/stores/statusPolling.svelte.ts`
  Reachability polling

- `src/lib/stores/versionPoller.svelte.ts`
  ParamsVersion freshness polling

- `src/lib/stores/batchPush.svelte.ts`
  Online optimistic write batching

- `src/lib/stores/pendingChanges.svelte.ts`
  Offline desired-state queue

- `src/lib/stores/driftStore.svelte.ts`
  Drift state

- `src/lib/stores/valuesCache.ts`
  Value cache keyed by `deviceId + GitCommit`

### Settings system

- `src/lib/types/schema.ts`
  Device-provided settings schema types

- `src/lib/components/schema/SchemaPanel.svelte`
  Panel/section rendering

- `src/lib/components/schema/SchemaItemRenderer.svelte`
  Setting row rendering plus a large amount of interaction logic

- `src/lib/rules/evaluator.ts`
  Declarative rules engine for visibility/enablement

- `src/lib/types/settings.ts`
  Large static legacy settings catalog and fallback definitions

### Feature routes

- `src/routes/dashboard/+page.svelte`
  Dashboard and backup flows

- `src/routes/dashboard/settings/+layout.svelte`
  Settings-wide cache hydration, drift baseline, reconnect flush, prefetch, retry behavior

- `src/routes/dashboard/settings/[category]/+page.svelte`
  Per-category settings page

- `src/routes/dashboard/settings/vehicle/+page.svelte`
  Vehicle page and brand settings

- `src/routes/dashboard/models/+page.svelte`
  Models feature

- `src/routes/dashboard/osm/+page.svelte`
  OSM/maps feature

## Architectural Reality Today

The current codebase works, but its responsibilities are distributed poorly.

The main problems are:

- `deviceState` is a god store
- route/layout files perform domain orchestration
- `device.ts` is not a thin API layer; it mutates domain state and owns workflows
- settings behavior is split across schema, legacy static definitions, caches, polling, and page effects
- too many large files mix rendering, network calls, cache logic, and sync behavior

In short:

- the product model is smarter than the architecture

## Non-Negotiable Behavioral Invariants

Any rewrite or major refactor must preserve these behaviors unless there is an explicit product decision not to.

### 1. Device schema drives settings behavior

- The frontend should not hardcode most settings layout and rules.
- Capabilities must affect visibility and enablement.
- Vehicle-brand-specific settings must fit the same model.

### 2. Cached values should render quickly

- Settings should load from local cache when possible.
- Fresh values should replace stale values in the background.
- Cache invalidation should be tied to software version, not just time.

### 3. Online writes should feel immediate

- UI should update optimistically.
- Rapid user changes should batch.
- Writes should be verified by readback when possible.
- Device state is authoritative in a conflict.

### 4. Offline user intent should not be lost

- If the device is offline, desired changes should queue.
- Queue must survive refresh/browser restart.
- Queue should auto-flush on reconnect.

### 5. Device-side changes should be detectable

- If the device changes a setting outside the web UI, the app should notice.
- Expected convergence should not be misclassified as drift.

### 6. Reachability and freshness are separate

- A device can be online but stale.
- A device can be offline but still render cached values.

### 7. Backups should export portable configuration, not device noise

- Do not treat all params as backup-worthy.
- Exclude ephemeral, device-specific, and regenerated values.

## Architecture Principles Going Forward

### 1. Thin views

Routes and components should:

- render data
- collect input
- dispatch intents

They should not own:

- write verification policy
- queue orchestration
- drift comparison
- cache invalidation logic

### 2. Separate read and write concerns

Reads and writes have different constraints. Treat them as different subsystems.

- reads: cache, freshness, polling, hydration
- writes: optimistic update, batching, queueing, verification, rollback

### 3. Separate current state from desired state

For remote device control, current state and desired state are not the same thing.

We need distinct concepts for:

- observed device value
- optimistic UI value
- queued desired value
- baseline cached value
- drifted value

### 4. Treat device as authority

The frontend is an operator console, not the source of truth.

Frontend rules:

- schema can describe behavior
- UI can be optimistic
- device wins on verified conflict

### 5. Use feature ownership, not giant global stores

Prefer feature-scoped services/stores over one shared mutable object that knows everything.

### 6. Prefer domain services over route effects

If the logic answers "what happens when...", it probably belongs in a service, not a route file.

## Target Architecture

This is the architecture new work should move toward.

### Layering

1. UI layer
   Routes, components, display-only helpers

2. Feature view-model/store layer
   Thin state holders for a single feature or page

3. Domain service layer
   Read, write, queue, cache, drift, backup, and schema services

4. Transport layer
   OpenAPI clients and low-level fetch helpers

### Proposed feature boundaries

Suggested shape:

```text
src/lib/
  domain/
    session/
    devices/
    schema/
    settings/
    sync/
    drift/
    backup/
    models/
    vehicle/
    maps/
  ui/
    components/
    view-models/
  api/
```

### Suggested services

- `SessionService`
  Auth session lifecycle, token retrieval, refresh policy

- `DeviceCatalogService`
  Device list load, alias metadata, selected device bootstrap

- `DeviceStatusService`
  Reachability, telemetry, offroad status, polling coordination

- `SchemaService`
  Fetch, cache, versioning, capability refresh, legacy fallback policy

- `SettingsQueryService`
  Param reads, hydration, SWR, freshness, invalidation

- `SettingsWriteService`
  Optimistic writes, batching, readback verification, rollback

- `DesiredStateQueueService`
  Offline queue, reconnect flush, offroad-blocked policy

- `DriftService`
  Baseline capture, observed-state comparison, expected-drift suppression

- `BackupService`
  Export/import policy and migration-safe filtering

- `ModelService`
  Model list, active model, favorites, cache, write actions

- `VehicleService`
  Car platform bundle, car list, fingerprint behavior, brand settings

- `MapService`
  OSM region params, cache, download actions

## State Ownership Model

The rewrite should make ownership explicit.

### Session state

Owned by:

- `SessionService`
- `sessionStore`

Contains:

- auth status
- user profile
- token readiness

### Device catalog state

Owned by:

- `DeviceCatalogService`
- `deviceCatalogStore`

Contains:

- paired devices
- selected device id
- aliases

### Device runtime state

Owned by:

- `DeviceStatusService`
- `deviceRuntimeStore`

Contains:

- online/offline/error/loading
- offroad state
- telemetry
- last seen / last checked

### Schema state

Owned by:

- `SchemaService`
- `schemaStore`

Contains:

- schema by device
- capabilities by device
- schema cache metadata

### Settings query state

Owned by:

- `SettingsQueryService`
- `settingsQueryStore`

Contains:

- observed values
- stale/fresh status
- cache metadata

### Settings write state

Owned by:

- `SettingsWriteService`
- `settingsWriteStore`

Contains:

- in-flight optimistic writes
- debounce batches
- write verification state

### Desired-state queue

Owned by:

- `DesiredStateQueueService`
- `desiredStateStore`

Contains:

- queued offline changes
- blocked-onroad entries
- flush status

### Drift state

Owned by:

- `DriftService`
- `driftStore`

Contains:

- baseline snapshot
- meaningful drift entries

## Canonical Data Flows

These are the flows agents should preserve when touching architecture-sensitive code.

### Bootstrap flow

1. Session becomes authenticated.
2. Device catalog loads.
3. Selected device is restored or chosen.
4. Device status polling starts.
5. Schema and settings cache hydrate.
6. Fresh data revalidates in the background.

### Settings read flow

1. Determine selected device.
2. Hydrate cached values if available.
3. Render stale values immediately.
4. Fetch fresh values.
5. Replace stale values with fresh values.
6. Update cache and freshness markers.

### Online write flow

1. User changes a setting.
2. UI applies optimistic value.
3. Change enters per-device debounce batch.
4. Batch flushes.
5. Device write request is sent.
6. Readback verifies resulting values.
7. Confirm or roll back.
8. Refresh capabilities if needed.

### Offline write flow

1. User changes a setting while device is unavailable.
2. Desired state is stored locally.
3. UI indicates queued state.
4. On reconnect, queue attempts flush.
5. Offroad-only items can remain blocked until safe.

### Drift flow

1. Capture baseline from cache or last known values.
2. Fetch fresh observed values.
3. Compare baseline vs fresh values.
4. Remove expected drift that matches pending desired state.
5. Surface meaningful drift entries.

## What Agents Should Avoid

Do not make these patterns worse.

### 1. Do not put new business logic into route layouts

If a layout starts owning cache policy, verification policy, or queue orchestration, stop and extract a service.

### 2. Do not extend `deviceState` with unrelated feature state

If a new field belongs to models, maps, backups, or migration only, it should not land in a global everything-store.

### 3. Do not add new static settings definitions unless it is legacy fallback work

Preferred path is schema-driven.

### 4. Do not duplicate fetch/decode/cache logic in feature pages

Prefer a shared query service.

### 5. Do not collapse online and offline writes into one vague code path

They can share primitives, but the policies are different and must stay explicit.

### 6. Do not treat optimistic success as actual success without a clear policy

We can be optimistic in UX, but the system should still distinguish:

- confirmed
- uncertain
- failed
- conflicted

## What Agents Should Prefer

### When adding a new device-backed feature

Prefer this sequence:

1. define the domain object
2. define read behavior
3. define write behavior
4. define cache/freshness policy
5. build thin UI on top

### When changing settings behavior

Check all of:

- schema-driven visibility
- schema-driven enablement
- online optimistic write path
- offline queue path
- drift interaction
- capability refresh side effects

### When changing cache behavior

Check all of:

- initial render speed
- invalidation on `GitCommit`
- stale vs fresh indicators
- drift baseline correctness

### When changing write behavior

Check all of:

- net-change cancellation
- debounce behavior
- verification readback
- conflict handling
- rollback semantics
- reconnect queue flush
- offroad-blocked writes

## Testing Priorities

The most important future tests are not simple render tests. They are behavior tests around the core invariants.

Priority scenarios:

- schema visibility/enablement rules
- cache hydration plus background refresh
- online optimistic write with readback confirmation
- online write conflict where device wins
- offline queue persistence and reconnect flush
- offroad-only queued write becoming unblocked later
- drift detection suppressing expected convergence
- invalidation when `ParamsVersion` changes
- backup filtering policy

## Migration Guidance

If doing a rewrite, move in this order:

1. extract auth/session boundary
2. extract device catalog and status services
3. extract schema service
4. extract settings query and write services
5. extract desired-state queue and drift services
6. move models, vehicle, and maps onto those shared primitives
7. reduce and eventually remove legacy static settings fallback if product policy allows

## Short Version

The right architecture for this product is:

- schema-driven
- cache-aware
- optimistic but verifiable
- explicit about desired state vs observed state
- service-oriented
- thin at the UI layer

If a future change makes the code shorter but weakens those properties, it is probably not an improvement.
