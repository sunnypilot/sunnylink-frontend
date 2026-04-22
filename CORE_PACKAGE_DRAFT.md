# `@sunnylink/core` Draft

Last updated: 2026-04-16

## Purpose

This document drafts a shared pure-TypeScript package that both the web app and a future mobile app can consume.

This package is:

- not a backend server
- not a UI library
- not a Svelte or React abstraction
- not a transport implementation

It is a headless domain package that owns the behavior of the app.

In plain English:

- web and mobile should look different
- web and mobile should behave the same

## Package Goal

Create a framework-agnostic package that contains the business rules for:

- schema types and rule evaluation
- param encoding/decoding
- settings reads and freshness
- online write batching and verification
- offline desired-state queueing
- drift detection
- backup/import/export policy
- cache and invalidation semantics

The host app provides:

- transport adapters
- persistence adapters
- timers/clock
- UI state binding
- navigation
- toasts/errors/presentation

## Non-Goals

`@sunnylink/core` should not contain:

- Svelte stores
- React hooks
- DOM access
- `window`, `document`, `localStorage`
- AsyncStorage
- Expo APIs
- Tailwind or styles
- route logic
- modal logic
- toasts
- auth SDK integrations

## Design Principles

### 1. Pure TypeScript

Everything should run in:

- browser
- React Native
- Node test runner

### 2. Adapter-Based

Core logic should depend on interfaces, not environment APIs.

### 3. Behavior First

The package should preserve product guarantees, not implementation quirks.

### 4. Small Surface, Strong Boundaries

Prefer a few focused services over one giant `CoreManager`.

### 5. Explicit State Machines

Observed state, optimistic state, queued desired state, and drifted state must remain separate concepts.

### 6. Testability

The package should be testable with fake adapters and no UI.

## Proposed Package Layout

```text
packages/
  core/
    package.json
    tsconfig.json
    src/
      index.ts
      contracts/
        api.ts
        persistence.ts
        runtime.ts
        logger.ts
      schema/
        types.ts
        rules.ts
        schema-service.ts
      params/
        types.ts
        codec.ts
      settings/
        types.ts
        query-service.ts
        freshness.ts
        cache.ts
      sync/
        types.ts
        write-engine.ts
        batch-engine.ts
        queue-engine.ts
      drift/
        types.ts
        drift-engine.ts
      backup/
        types.ts
        backup-policy.ts
        backup-service.ts
      shared/
        events.ts
        result.ts
        equality.ts
        errors.ts
        keys.ts
```

## Core Concepts

These concepts should be first-class in the package API.

### Observed State

What the device most recently reported.

### Desired State

What the user wants the device to become.

### Optimistic State

What the UI is temporarily showing before the device confirms the write.

### Baseline State

What the app previously believed to be true and uses for drift comparison.

### Drift

A meaningful difference between baseline state and observed device state that is not simply expected convergence.

### Freshness

How trustworthy the local view is right now.

Examples:

- fresh
- stale
- revalidating
- unavailable

## Contracts

These are the interfaces the host app should implement.

### Device API contract

```ts
export type ParamType = 'String' | 'Bool' | 'Int' | 'Float' | 'Time' | 'Json' | 'Bytes';

export interface RawDeviceParam {
  key: string;
  value: string | null;
  type?: ParamType;
}

export interface WriteParam {
  key: string;
  value: string;
  isCompressed?: boolean;
}

export interface DeviceApi {
  fetchSchema(deviceId: string, token: string): Promise<SettingsSchema | null>;
  readParams(deviceId: string, keys: string[], token: string): Promise<RawDeviceParam[]>;
  writeParams(deviceId: string, params: WriteParam[], token: string): Promise<void>;
  fetchParamsVersion(deviceId: string, token: string): Promise<number | null>;
}
```

Notes:

- This keeps transport-specific OpenAPI types out of the shared core.
- Web and mobile can each adapt their own API clients to this interface.

### Persistence contract

```ts
export interface PersistenceAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  getMany?(keys: string[]): Promise<Record<string, string | null>>;
  removeMany?(keys: string[]): Promise<void>;
}
```

Notes:

- Keep it async so both browser and React Native fit cleanly.
- Web can wrap `localStorage`; mobile can wrap AsyncStorage or SQLite.

### Runtime contract

```ts
export interface TimerHandle {
  cancel(): void;
}

export interface RuntimeAdapter {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  sleep(ms: number): Promise<void>;
}
```

Notes:

- Needed for debounce batching, verification polling, and deterministic tests.

### Logger contract

```ts
export interface Logger {
  debug?(message: string, meta?: unknown): void;
  info?(message: string, meta?: unknown): void;
  warn?(message: string, meta?: unknown): void;
  error?(message: string, meta?: unknown): void;
}
```

## Module Breakdown

## `schema/`

### Responsibility

- define schema types
- evaluate visibility and enablement rules
- fetch and cache schema
- expose capabilities

### Source inspiration in current repo

- `src/lib/types/schema.ts`
- `src/lib/rules/evaluator.ts`
- `src/lib/stores/schema.svelte.ts`

### Public API sketch

```ts
export interface SchemaService {
  getCached(deviceId: string, softwareVersion: string): Promise<SettingsSchema | null>;
  load(deviceId: string, token: string, softwareVersion?: string): Promise<SchemaLoadResult>;
  refreshCapabilities(deviceId: string, token: string): Promise<Capabilities | null>;
  clear(deviceId: string): Promise<void>;
}

export function evaluateRule(rule: Rule, ctx: RuleContext): boolean;
export function evaluateRules(rules: Rule[] | undefined, ctx: RuleContext): boolean;
export function getDisabledReasons(...): string[];
export function collectOffroadOnlyKeys(schema: SettingsSchema): Set<string>;
```

### Notes

- This module should stay mostly pure.
- Schema caching belongs here, not in UI code.

## `params/`

### Responsibility

- encode param values for writes
- decode param values from reads
- normalize values for equality checks

### Source inspiration in current repo

- `src/lib/utils/device.ts`

### Public API sketch

```ts
export function decodeParam(param: RawDeviceParam): unknown;
export function encodeParam(input: {
  key: string;
  value: unknown;
  type: ParamType;
}): string | null;

export function normalizeParamValue(value: unknown): string;
```

### Notes

- This is a strong early extraction candidate.
- It should be completely framework-agnostic and heavily tested.

## `settings/`

### Responsibility

- query settings values
- hydrate cached values
- model freshness
- revalidate stale data
- invalidate when software version or params version changes

### Source inspiration in current repo

- `src/lib/stores/valuesCache.ts`
- `src/lib/stores/versionPoller.svelte.ts`
- parts of `src/routes/dashboard/settings/+layout.svelte`
- parts of `src/routes/dashboard/settings/[category]/+page.svelte`

### Public API sketch

```ts
export type FreshnessState =
  | 'fresh'
  | 'stale'
  | 'revalidating'
  | 'unavailable';

export interface SettingsSnapshot {
  deviceId: string;
  values: Record<string, unknown>;
  softwareVersion?: string;
  paramsVersion?: number;
  freshness: FreshnessState;
  updatedAt?: number;
}

export interface SettingsQueryService {
  hydrate(deviceId: string, softwareVersion?: string): Promise<SettingsSnapshot | null>;
  read(deviceId: string, keys: string[], token: string): Promise<SettingsSnapshot>;
  revalidate(deviceId: string, keys: string[], token: string): Promise<SettingsSnapshot>;
  markStale(deviceId: string): Promise<void>;
  clear(deviceId: string): Promise<void>;
}
```

### Notes

- This service should not know about UI screens or panels.
- A host app can decide whether to fetch all keys, visible keys, or page-specific keys.

## `sync/write-engine.ts`

### Responsibility

- apply optimistic writes
- verify writes by readback
- resolve confirmed / uncertain / failed / conflicted outcomes

### Source inspiration in current repo

- `src/lib/stores/batchPush.svelte.ts`

### Public API sketch

```ts
export type WriteOutcome =
  | { kind: 'confirmed'; keys: string[] }
  | { kind: 'uncertain'; keys: string[] }
  | { kind: 'failed'; keys: string[]; reason: string }
  | { kind: 'conflict'; conflicts: Array<{ key: string; observedValue: unknown }> };

export interface WriteIntent {
  key: string;
  desiredValue: unknown;
  previousValue: unknown;
  paramType: ParamType;
}

export interface SettingsWriteService {
  dispatch(deviceId: string, intents: WriteIntent[], token: string): Promise<WriteOutcome>;
}
```

### Notes

- This should not emit toasts.
- It should return structured outcomes the host app can present.

## `sync/batch-engine.ts`

### Responsibility

- queue online writes
- debounce them
- collapse net-zero changes

### Source inspiration in current repo

- `src/lib/stores/batchPush.svelte.ts`

### Public API sketch

```ts
export interface BatchEngineState {
  deviceId: string;
  pending: Record<string, WriteIntent>;
  flushing: boolean;
}

export interface BatchEngine {
  enqueue(deviceId: string, intent: WriteIntent): void;
  cancel(deviceId: string, key: string): void;
  flush(deviceId: string, token: string): Promise<WriteOutcome | null>;
  getState(deviceId: string): BatchEngineState;
  subscribe(listener: (deviceId: string, state: BatchEngineState) => void): () => void;
}
```

### Notes

- The host app should not have to re-implement debounce logic.
- This is one of the harder pieces to extract cleanly.

## `sync/queue-engine.ts`

### Responsibility

- persist offline desired-state changes
- restore them on boot
- flush them later
- support blocked-onroad policy

### Source inspiration in current repo

- `src/lib/stores/pendingChanges.svelte.ts`
- parts of `src/routes/dashboard/settings/+layout.svelte`

### Public API sketch

```ts
export type QueueStatus =
  | 'pending'
  | 'pushing'
  | 'confirmed'
  | 'failed'
  | 'blocked_onroad';

export interface QueuedChange {
  key: string;
  desiredValue: unknown;
  previousValue: unknown;
  createdAt: number;
  attempts: number;
  status: QueueStatus;
  lastError?: string;
}

export interface QueueFlushPolicy {
  isDeviceOnline: boolean;
  isOffroad: boolean;
  offroadOnlyKeys?: Set<string>;
}

export interface DesiredStateQueue {
  load(deviceId: string): Promise<QueuedChange[]>;
  enqueue(deviceId: string, change: Omit<QueuedChange, 'createdAt' | 'attempts' | 'status'>): Promise<void>;
  flush(deviceId: string, token: string, policy: QueueFlushPolicy): Promise<QueuedChange[]>;
  clear(deviceId: string): Promise<void>;
}
```

### Notes

- This should remain independent from how the host UI shows badges or banners.

## `drift/`

### Responsibility

- track baseline
- compare baseline vs observed
- suppress expected drift that matches desired state

### Source inspiration in current repo

- `src/lib/utils/drift.ts`
- `src/lib/stores/driftStore.svelte.ts`

### Public API sketch

```ts
export interface DriftEntry {
  key: string;
  baselineValue: unknown;
  observedValue: unknown;
  detectedAt: number;
}

export interface DriftService {
  setBaseline(deviceId: string, values: Record<string, unknown>): void;
  getBaseline(deviceId: string): Record<string, unknown>;
  detect(deviceId: string, observed: Record<string, unknown>, desired?: Record<string, unknown>): DriftEntry[];
  clear(deviceId: string): void;
}
```

### Notes

- This module should be mostly pure.
- Metadata enrichment like panel/section title can be handled in a helper if needed.

## `backup/`

### Responsibility

- determine which keys belong in backups
- format backup payloads
- parse backup payloads
- preserve deterministic output

### Source inspiration in current repo

- `src/lib/utils/settings.ts`

### Public API sketch

```ts
export interface BackupPolicy {
  getBackupKeys(deviceSettings?: Array<{ key?: string }>): string[];
}

export interface SettingsBackup {
  version: number;
  timestamp: number;
  deviceId: string;
  settings: Record<string, unknown>;
  unavailableSettings?: Array<{ key: string; reason: string }>;
}

export interface BackupService {
  buildBackup(input: {
    deviceId: string;
    settings: Record<string, unknown>;
    unavailableSettings?: Array<{ key: string; reason: string }>;
  }): SettingsBackup;
  parseBackup(json: string): SettingsBackup;
}
```

### Notes

- The backup policy should be data-driven if possible.
- This is another strong early extraction candidate.

## State Model Recommendation

Do not put framework-specific stores in the shared package.

Instead, use headless services that expose one of these patterns:

### Preferred pattern

- imperative methods for commands
- `getState()` for current snapshot
- `subscribe(listener)` for state changes

Example:

```ts
interface SubscribableState<T> {
  getState(): T;
  subscribe(listener: (state: T) => void): () => void;
}
```

This maps cleanly to:

- Svelte stores
- React state/hooks
- plain tests

### Why not framework stores?

Because then the package becomes:

- Svelte-shaped and awkward in React Native
- React-shaped and awkward in Svelte
- harder to test in isolation

## Recommended Public Exports

Top-level exports should stay small and boring.

### `@sunnylink/core`

```ts
export * from './schema/types';
export * from './schema/rules';
export * from './params/types';
export * from './params/codec';
export * from './settings/types';
export * from './sync/types';
export * from './drift/types';
export * from './backup/types';
export * from './contracts/api';
export * from './contracts/persistence';
export * from './contracts/runtime';
export * from './contracts/logger';
```

### Factory exports

```ts
export { createSchemaService } from './schema/schema-service';
export { createSettingsQueryService } from './settings/query-service';
export { createSettingsWriteService } from './sync/write-engine';
export { createBatchEngine } from './sync/batch-engine';
export { createDesiredStateQueue } from './sync/queue-engine';
export { createDriftService } from './drift/drift-engine';
export { createBackupService, createBackupPolicy } from './backup/backup-service';
```

## How Web Would Consume It

Web app responsibilities:

- provide `DeviceApi` adapter over current OpenAPI clients
- provide `PersistenceAdapter` over `localStorage`
- bind service snapshots into Svelte state
- show banners, toasts, badges, and modals

Web should delete or drastically reduce:

- giant singleton orchestration stores
- route-owned sync logic
- duplicated cache/fetch behavior in page files

## How Mobile Would Consume It

Mobile app responsibilities:

- provide `DeviceApi` adapter using its own network layer
- provide `PersistenceAdapter` over AsyncStorage or SQLite
- bind service snapshots into React state/hooks
- build native screens and navigation

Mobile should not need to re-implement:

- write verification
- queue semantics
- drift rules
- backup policy

## Suggested Extraction Order

Start with the easiest pure modules and move toward orchestration.

### Phase 1

- `schema/types`
- `schema/rules`
- `params/codec`
- `drift/`
- `backup/`

### Phase 2

- `settings/freshness`
- `settings/cache`
- `schema/schema-service`

### Phase 3

- `sync/write-engine`
- `sync/batch-engine`
- `sync/queue-engine`

### Phase 4

- convert the web app to consume `@sunnylink/core`

### Phase 5

- build mobile app against the same core

## Risks To Avoid

### 1. Repackaging the current store architecture

Do not create `@sunnylink/core` as “all the existing singleton stores, but moved.”

That would share the current problems across both apps.

### 2. Mixing framework and domain concerns

If a module imports Svelte, React, Expo, or browser globals, it probably does not belong in core.

### 3. Leaking transport types into the domain package

Core should define its own stable contracts and adapt OpenAPI or fetch-specific responses at the edge.

### 4. Hiding desired state and observed state inside one value bag

That distinction is one of the most important things this package should make clearer.

## Short Version

`@sunnylink/core` should be:

- a pure TypeScript package
- framework-agnostic
- adapter-based
- behavior-rich
- UI-poor
- strongly typed
- highly testable

If done well, it becomes the shared behavior engine for:

- web
- mobile
- possibly future tooling/tests

without forcing any of them to share UI or platform assumptions.
