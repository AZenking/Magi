# Tasks: 客户端管理与心跳

**Input**: Design documents from `/specs/007-client-management-heartbeat/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently after the foundational phase.

**Testing approach**: Tests are included because the feature specification defines independent acceptance scenarios, the constitution requires layer/TV quality gates, and the plan includes API, OpenAPI, concurrency, and physical-device validation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the feature-specific structure and verification harness without changing runtime behavior.

- [X] T001 [P] Create the backend feature directories `apps/api/src/domain/device-client/`, `apps/api/src/application/device-client/`, `apps/api/src/http/account-client/`, and `apps/api/src/http/open/` according to [plan.md](./plan.md).
- [X] T002 [P] Create the Android TV feature directories `apps/tv/app/src/main/kotlin/com/magi/tv/domain/`, `apps/tv/app/src/main/kotlin/com/magi/tv/data/`, `apps/tv/app/src/main/kotlin/com/magi/tv/platform/`, and `apps/tv/app/src/main/kotlin/com/magi/tv/ui/auth/` without adding layer-crossing imports.
- [X] T003 [P] Add the planned TV test/runtime dependencies (Lifecycle process support, coroutines-test, MockWebServer, and Compose UI test support) in `apps/tv/gradle/libs.versions.toml` and `apps/tv/app/build.gradle.kts`.
- [X] T004 [P] Add public-device client identifier, pairing expiry, heartbeat window, and legacy cutover settings to `apps/api/src/infrastructure/config/device-client.config.ts`, with environment-backed values and safe development defaults.
- [X] T005 [P] Add shared API/Web/TV test fixture boundaries for device principals and non-secret sample metadata in `apps/api/src/test/device-client-fixtures.ts`, `apps/web/src/test/device-client-fixtures.ts`, and `apps/tv/app/src/test/kotlin/com/magi/tv/data/DeviceClientFixtures.kt`.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared contract, database integrity, domain ports, authentication principal, and module wiring required by every user story.

**Checkpoint**: No user story implementation starts until this phase passes its schema, type, and contract checks.

- [X] T006 [P] Define Zod schemas and inferred types for device clients, presence status, device authorization, token grants, heartbeat, rename, pagination, and problem codes in `packages/types/src/dto/device-client.ts`.
- [X] T007 Export the device-client schemas/types from `packages/types/src/index.ts` and add boundary tests for trim/length/printable-name, enum, nullable timestamp, and discriminated-grant behavior in `packages/types/src/dto/device-client.test.ts`.
- [X] T008 Move the pure Drizzle auth table definitions from `apps/api/src/infrastructure/database/schema/auth.ts` to `packages/backend-core/src/database/schema/auth.ts`, preserve the API barrel re-export in `apps/api/src/infrastructure/database/schema/index.ts`, and verify the generated migration contains no auth-table DDL.
- [X] T009 Extend `packages/backend-core/src/database/schema/oauth-clients.ts` with `clientKind` and confidential/public secret invariants, and extend `packages/backend-core/src/database/schema/oauth-access-tokens.ts` with nullable `deviceClientId`, `grantType`, `scope`, indexes, and backward-compatible existing rows.
- [X] T010 [P] Add `device_clients`, `device_authorization_grants`, and `device_refresh_tokens` tables with real user/OAuth/device/token foreign keys, uniqueness constraints, status checks, indexes, and timestamp columns in `packages/backend-core/src/database/schema/device-clients.ts`, `packages/backend-core/src/database/schema/device-authorization-grants.ts`, and `packages/backend-core/src/database/schema/device-refresh-tokens.ts`.
- [X] T011 Update the operational schema exports and explicit Drizzle input list in `packages/backend-core/src/database/schema/index.ts`, `apps/api/src/infrastructure/database/schema/index.ts`, and `apps/api/src/infrastructure/database/drizzle.config.ts` so every new table has one source of truth.
- [X] T012 Generate and review the migration under `apps/api/drizzle/` with `pnpm --filter @magi/api db:generate`, then apply it with `pnpm --filter @magi/api db:migrate`; reject any user/auth table drop-recreate, missing FK, missing index, or unsafe OAuth backfill.
- [X] T013 [P] Define framework-free device-client value objects, `active → revoked` transition rules, derived online/offline status, display-name validation, and principal invariants in `apps/api/src/domain/device-client/device-client.model.ts`.
- [X] T014 [P] Define repository ports for list/projection, authorization grants, conditional heartbeat, atomic revoke, access-token lookup, refresh rotation, and owner-scoped rename in `apps/api/src/domain/device-client/device-client.repository.ts` and `apps/api/src/domain/device-client/index.ts`.
- [X] T015 [P] Add audit action constants for registration, rename, revoke, and rate-limited rejected access in `apps/api/src/domain/audit/audit-actions.ts`, preserving existing action names and redaction conventions.
- [X] T016 Extend the open-token domain types and repository contract in `apps/api/src/domain/oauth/access-token.model.ts`, `apps/api/src/domain/oauth/access-token.repository.ts`, and `apps/api/src/shared/guards/access-token.guard.ts` to return an integration/device discriminated principal and reject inactive device principals on every protected open operation.
- [X] T017 [P] Define TV domain session states, authorization reasons, credential-store port, connectivity port, heartbeat port, and use-case interfaces without Android/Retrofit/DataStore/Media3 imports in `apps/tv/app/src/main/kotlin/com/magi/tv/domain/model/ClientSession.kt`, `apps/tv/app/src/main/kotlin/com/magi/tv/domain/repository/ClientSessionRepository.kt`, and `apps/tv/app/src/main/kotlin/com/magi/tv/domain/repository/ClientCredentialStore.kt`.
- [X] T018 Wire shared repositories, account-client providers, open-auth providers, and device-heartbeat providers into `apps/api/src/http/account-client/account-client.module.ts`, `apps/api/src/http/open/open.module.ts`, and the application module registration used by `apps/api/src/main.ts`.
- [X] T019 Update Swagger/OpenAPI generation in `apps/api/src/main.ts` and the open API module so the new device authorization, token-grant, heartbeat, account-client, error, nullable, and enum schemas are emitted into `/api/open.json`.
- [X] T020 [P] Write failing domain tests for device status transitions, online threshold boundaries, display-name rules, and principal invariants in `apps/api/src/domain/device-client/__tests__/device-client.model.test.ts`.
- [X] T021 [P] Add database migration and schema integration assertions for FK ownership, status checks, OAuth backfill, token indexes, and no-auth-DDL movement in `apps/api/src/infrastructure/database/__tests__/device-client-migration.test.ts`.
- [X] T022 [P] Add the TV OpenAPI compatibility test scaffold for device authorization, token grants, heartbeat response fields, nullable values, enums, and problem codes in `apps/tv/app/src/test/kotlin/com/magi/tv/data/remote/OpenApiContractTest.kt`.

## Phase 3: User Story 1 - 查看账户客户端 (Priority: P1) 🎯 MVP

**Goal**: Let a logged-in account owner enter the left-side account menu and see a complete, privacy-safe, presence-sorted list of only their device clients.

**Independent Test**: Seed online, offline, and revoked devices for accounts A/B; open account A's left-side client menu; verify fields, derived status, stable pagination, empty/error/stale states, and zero visibility of account B or secrets.

### Tests for User Story 1

- [X] T023 [P] [US1] Write a failing HTTP contract test for `GET /api/account/clients` covering session auth, pagination, owner filtering, status sorting, `asOf`, nullable `lastActiveAt`, and problem responses in `apps/api/src/http/account-client/__tests__/account-client-list.contract.test.ts`.
- [X] T024 [P] [US1] Write failing domain/application tests for online/offline/revoked projection, stable tie-breaking, empty results, and cross-account not-found behavior in `apps/api/src/application/device-client/__tests__/list-device-clients.use-case.test.ts`.
- [X] T025 [US1] Implement the owner-scoped list projection with a single database time, online→offline→revoked ordering, `lastHeartbeatAt DESC NULLS LAST`, and page metadata in `apps/api/src/infrastructure/database/device-client.repository.ts`.
- [X] T026 [US1] Implement `ListDeviceClientsUseCase` with `CurrentUser.id` ownership, validation of page/pageSize, and no accountId input in `apps/api/src/application/device-client/list-device-clients.use-case.ts`.
- [X] T027 [US1] Implement the authenticated list endpoint and response mapping without secret/token/IP/playback fields in `apps/api/src/http/account-client/account-client.controller.ts`.
- [X] T028 [US1] Complete account-client dependency injection and route registration for `GET /api/account/clients` in `apps/api/src/http/account-client/account-client.module.ts` and the application module imported by `apps/api/src/main.ts`.
- [X] T029 [US1] Add the `account` navigation section, left-side `客户端管理` child, route-prefix activation, and breadcrumb labels in `apps/web/src/components/app-menu.tsx` and `apps/web/src/components/app-breadcrumb.tsx`, keeping `/dashboard/oauth-clients` under `开放接口`.
- [X] T030 [US1] Add the thin TanStack route and query layer for `/dashboard/account/clients` in `apps/web/src/routes/dashboard/account/clients.tsx` and `apps/web/src/features/dashboard/account-clients/client-queries.ts`.
- [X] T031 [US1] Implement the account client table with ProTableWrapper, privacy-safe columns, text status Tags, stable server pagination, 10-second visible refresh, focus refresh, empty/loading/error/stale states, and retry behavior in `apps/web/src/features/dashboard/account-clients/client-management-page.tsx`.
- [X] T032 [P] [US1] Add Web tests for account menu activation, list fields/statuses, query parameters, pagination, empty/loading/initial-error/background-refresh-error states, stale timestamp messaging, and secret/privacy exclusions in `apps/web/src/components/app-menu.test.tsx` and `apps/web/src/features/dashboard/account-clients/client-management-page.test.tsx`.
- [X] T033 [US1] Add an API integration test that seeds two accounts and validates list isolation, stable ordering, 150-second boundary derivation, and P95 fixture behavior in `apps/api/src/http/account-client/__tests__/account-client-list.integration.test.ts`.

**Checkpoint**: User Story 1 is independently demoable through Web list navigation and the authenticated list contract, using seeded device records even before TV pairing is enabled.

## Phase 4: User Story 2 - 通过心跳获知在线状态 (Priority: P1)

**Goal**: Accept authenticated foreground heartbeats, derive online state from server time, recover after network return, and keep heartbeat independent from playback.

**Independent Test**: Seed an active device-bound token; send duplicate, delayed, concurrent, and stopped heartbeats; verify monotonic timestamps, online/offline boundaries, stable device identity, and no heartbeat writes after revoke.

### Tests for User Story 2

- [X] T034 [P] [US2] Write failing domain tests for 60-second scheduling semantics, 150-second presence boundaries, revoked precedence, generation checks, and no local-clock authority in `apps/api/src/domain/device-client/__tests__/heartbeat-rules.test.ts`.
- [X] T035 [P] [US2] Write a failing OpenAPI/controller contract test for `POST /api/open/v1/device-clients/heartbeat` covering device principal requirement, accepted metadata, server time, response interval, 401/403/429, and secret-free logging in `apps/api/src/http/open/__tests__/device-heartbeat.contract.test.ts`.
- [X] T036 [US2] Implement the conditional monotonic heartbeat update using database receive time, active-status predicate, validated app/platform versions, and a result that distinguishes active update from revoked/invalid principal in `apps/api/src/infrastructure/database/device-client.repository.ts`.
- [X] T037 [US2] Implement `RecordHeartbeatUseCase` to require a device principal, reject client/account IDs in the body, call the conditional repository update, and return server time/last active/60-second interval/150-second window in `apps/api/src/application/device-client/record-heartbeat.use-case.ts`.
- [X] T038 [US2] Implement the protected heartbeat controller with Zod validation, `AccessTokenGuard`, request-id propagation, throttling, problem responses, and no successful-heartbeat audit rows in `apps/api/src/http/open/device-heartbeat.controller.ts`.
- [X] T039 [US2] Add device-principal checks to all open API guard paths and rate-limited rejected-access observability in `apps/api/src/shared/guards/access-token.guard.ts`, `apps/api/src/application/audit/append-audit-event.use-case.ts`, and `apps/api/src/infrastructure/database/audit-event-writer.repository.ts`.
- [X] T040 [US2] Add API integration/concurrency tests for duplicate/乱序/parallel heartbeats, revoke race final state, 429 Retry-After, request-id response headers, and 10,000-client/1,000-online load fixture in `apps/api/src/http/open/__tests__/device-heartbeat.integration.test.ts`.
- [X] T041 [US2] Implement TV data-layer heartbeat DTOs, device-bound API calls, domain mapping, and repository behavior for 204/200 success, 401, 403, 429, timeout, and 5xx in `apps/tv/app/src/main/kotlin/com/magi/tv/data/remote/ClientApi.kt`, `apps/tv/app/src/main/kotlin/com/magi/tv/data/remote/ClientDtos.kt`, and `apps/tv/app/src/main/kotlin/com/magi/tv/data/repository/DefaultClientSessionRepository.kt`.
- [X] T042 [US2] Implement the single Application-lifetime heartbeat coordinator with ProcessLifecycleOwner, ConnectivityManager port, immediate ON_START/network recovery, 60-second success cadence, full-jitter capped backoff, single-flight coalescing, ON_STOP cancellation, and stale-generation rejection in `apps/tv/app/src/main/kotlin/com/magi/tv/platform/lifecycle/ClientHeartbeatCoordinator.kt`.
- [X] T043 [P] [US2] Add TV unit tests for coordinator scheduling/cancellation, connectivity recovery, jitter bounds, single-flight behavior, stale callbacks, and heartbeat-independent playback in `apps/tv/app/src/test/kotlin/com/magi/tv/domain/usecase/ClientHeartbeatCoordinatorTest.kt` and `apps/tv/app/src/test/kotlin/com/magi/tv/data/repository/DefaultClientSessionRepositoryTest.kt`.
- [X] T044 [US2] Add the end-to-end heartbeat validation harness and assertions for ≤10-second foreground recovery, ≤180-second offline display, and no heartbeat increase during rapid channel switching in `apps/tv/app/src/test/kotlin/com/magi/tv/data/HeartbeatAcceptanceTest.kt` and `apps/api/src/http/open/__tests__/device-heartbeat.load.test.ts`.

**Checkpoint**: User Story 2 is independently testable with a seeded device token and does not require Web rename/revoke or the TV pairing UI.

## Phase 5: User Story 3 - 识别并撤销客户端 (Priority: P2)

**Goal**: Let the account owner rename an owned device and atomically revoke its access, tokens, and future heartbeats.

**Independent Test**: Seed one active device for account A; rename it, revoke it with confirmation, race a heartbeat, then verify the row is terminally revoked, all protected operations fail, and account B cannot infer or mutate it.

### Tests for User Story 3

- [X] T045 [P] [US3] Write failing domain tests for trim/printable 1–64-character names, duplicate names, active-only rename, terminal revoke, idempotent repeated revoke, and revoked status precedence in `apps/api/src/domain/device-client/__tests__/rename-revoke-rules.test.ts`.
- [X] T046 [P] [US3] Write failing HTTP contract tests for owner-scoped `PATCH /api/account/clients/:id` and `POST /api/account/clients/:id/revoke`, including Idempotency-Key, cross-account 404, conflict, redacted response, and audit expectations in `apps/api/src/http/account-client/__tests__/account-client-lifecycle.contract.test.ts`.
- [X] T047 [US3] Implement the owner-scoped rename and transactional revoke repository operations that update device status, revoke device Access/Refresh Token rows, and append the audit event as one atomic unit in `apps/api/src/infrastructure/database/device-client.repository.ts`.
- [X] T048 [US3] Implement `RenameDeviceClientUseCase` and `RevokeDeviceClientUseCase` with owner checks, idempotency handling, terminal-state semantics, request context, and redacted output in `apps/api/src/application/device-client/rename-device-client.use-case.ts` and `apps/api/src/application/device-client/revoke-device-client.use-case.ts`.
- [X] T049 [US3] Add PATCH rename and POST revoke controller routes with Zod validation, confirmation-independent server safety, ProblemDetails mapping, and no accountId/body ownership input in `apps/api/src/http/account-client/account-client.controller.ts`.
- [X] T050 [US3] Add lifecycle audit action serialization, secret redaction, rejected-access sampling, and request-id assertions for device registration/rename/revoke in `apps/api/src/domain/audit/audit-actions.ts`, `apps/api/src/infrastructure/database/audit-event-writer.repository.ts`, and `apps/api/src/shared/logging/`.
- [X] T051 [US3] Implement Web rename and revoke UI with controlled Modal/Form/danger confirmation, trim validation, pending de-duplication, focus restoration, terminal-state action removal, and query invalidation in `apps/web/src/features/dashboard/account-clients/rename-client-modal.tsx`, `apps/web/src/features/dashboard/account-clients/revoke-client-modal.tsx`, and `apps/web/src/features/dashboard/account-clients/client-management-page.tsx`.
- [X] T052 [P] [US3] Add Web tests for rename validation/payload/failure retention and revoke confirmation/cancel/pending/success/failure/terminal-row behavior in `apps/web/src/features/dashboard/account-clients/rename-client-modal.test.tsx` and `apps/web/src/features/dashboard/account-clients/revoke-client-modal.test.tsx`.
- [X] T053 [US3] Add API integration tests for cross-account isolation, atomic rollback, concurrent revoke/heartbeat, repeated Idempotency-Key, protected content rejection, and zero secret leakage in `apps/api/src/http/account-client/__tests__/account-client-lifecycle.integration.test.ts`.

**Checkpoint**: User Story 3 is independently demoable from the Web client list with seeded records and proves the security-critical revoke boundary without requiring TV re-pairing.

## Phase 6: User Story 4 - 客户端从中断或撤销中恢复 (Priority: P2)

**Goal**: Pair a TV to an account, persist only protected rotating credentials, recover from temporary failures, and guide revoked/unauthorized devices through D-pad-safe reauthorization.

**Independent Test**: Start a new TV authorization, approve it in Web, complete token exchange, interrupt network, force 401/refresh replay/revocation, and verify bounded recovery or explicit reauthorization with focus/Back correctness.

### Tests for User Story 4

- [X] T054 [P] [US4] Write failing HTTP/OpenAPI contract tests for device authorization start, preview/approve/deny, device-code exchange, refresh exchange, `authorization_pending`, `slow_down`, `access_denied`, `expired_token`, `invalid_grant`, and rate limits in `apps/api/src/http/open/__tests__/device-authorization.contract.test.ts` and `apps/api/src/http/account-client/__tests__/device-authorization.contract.test.ts`.
- [X] T055 [P] [US4] Write failing TV domain tests for `Unregistered → Authorizing → Registered/RequiresAuthorization`, Back cancellation, expiry, slow_down interval, replay terminality, and stale-generation rejection in `apps/tv/app/src/test/kotlin/com/magi/tv/domain/usecase/ClientSessionUseCasesTest.kt`.
- [X] T056 [US4] Implement device authorization grant start, preview, approve, deny, and atomic device-code exchange use cases with HMAC user-code lookup, 10-minute expiry, 5-second interval, owner binding, and one-time consumption in `apps/api/src/application/device-client/begin-device-authorization.use-case.ts`, `apps/api/src/application/device-client/inspect-device-authorization.use-case.ts`, `apps/api/src/application/device-client/decide-device-authorization.use-case.ts`, and `apps/api/src/application/device-client/exchange-device-code.use-case.ts`.
- [X] T057 [US4] Implement rotating Refresh Token persistence, family replay detection, 30-day inactivity expiry, Access Token issuance, and atomic device revoke integration in `apps/api/src/infrastructure/database/device-refresh-token.repository.ts`, `apps/api/src/application/device-client/refresh-device-token.use-case.ts`, and `apps/api/src/domain/device-client/device-token.model.ts`.
- [X] T058 [US4] Extend the open auth controller and Zod grant dispatch to support device-code and refresh-token grants while preserving confidential client_credentials behavior in `apps/api/src/http/open/auth.controller.ts`, `apps/api/src/application/oauth/issue-token.use-case.ts`, `apps/api/src/domain/oauth/access-token.model.ts`, and `packages/types/src/dto/device-client.ts`.
- [X] T059 [US4] Add authenticated Web preview/approve/deny endpoints and module wiring for pending device authorizations in `apps/api/src/http/account-client/account-client.controller.ts`, `apps/api/src/http/account-client/account-client.module.ts`, and `apps/api/src/application/device-client/inspect-device-authorization.use-case.ts`.
- [X] T060 [US4] Implement the Web bind-client flow with short-code normalization, preview metadata, editable display name, expiry messaging, approve/deny actions, and safe focus restoration in `apps/web/src/routes/dashboard/account/clients/authorize.tsx`, `apps/web/src/features/dashboard/account-clients/device-authorization-form.tsx`, and `apps/web/src/features/dashboard/account-clients/client-queries.ts`.
- [X] T061 [P] [US4] Add Web authorization-flow tests for code normalization, preview/expiry/unknown states, approve/deny confirmation, pending de-duplication, focus restoration, and no rendering of device_code/secrets in `apps/web/src/features/dashboard/account-clients/device-authorization-form.test.tsx`.
- [X] T062 [US4] Implement the domain credential-store adapter contract and Android Keystore AES-256-GCM encrypted Preferences DataStore with schema version, atomic replacement, Auto Backup exclusion, tamper/key-loss cleanup, and no plaintext token persistence in `apps/tv/app/src/main/kotlin/com/magi/tv/platform/security/KeystoreClientCredentialStore.kt`, `apps/tv/app/src/main/AndroidManifest.xml`, and `apps/tv/app/src/main/res/xml/backup_rules.xml`.
- [X] T063 [US4] Replace compile-time shared Client Secret token issuance with Mutex-protected device-code/refresh-token rotation, single retry on 401, invalid_grant/revoked/replay classification, and in-memory Access Token caching in `apps/tv/app/src/main/kotlin/com/magi/tv/data/auth/TokenManager.kt`, `apps/tv/app/src/main/kotlin/com/magi/tv/data/auth/TokenApi.kt`, `apps/tv/app/src/main/kotlin/com/magi/tv/data/auth/TokenStore.kt`, and `apps/tv/app/src/main/kotlin/com/magi/tv/data/remote/MagiClient.kt`.
- [X] T064 [US4] Implement TV device authorization API DTO mapping and repository polling for pending/slow_down/denied/expired/success responses in `apps/tv/app/src/main/kotlin/com/magi/tv/data/remote/ClientApi.kt`, `apps/tv/app/src/main/kotlin/com/magi/tv/data/remote/ClientDtos.kt`, and `apps/tv/app/src/main/kotlin/com/magi/tv/data/repository/DefaultClientSessionRepository.kt`.
- [X] T065 [US4] Implement the D-pad-safe authorization and reauthorization UI/ViewModel, including code/URI display, explicit focus entry, 16sp/14sp/48dp rules, offline/401/revoked states, and Back/focus restoration in `apps/tv/app/src/main/kotlin/com/magi/tv/ui/auth/ClientAuthorizationViewModel.kt`, `apps/tv/app/src/main/kotlin/com/magi/tv/ui/auth/ClientAuthorizationScreen.kt`, and `apps/tv/app/src/main/kotlin/com/magi/tv/ui/TvApp.kt`.
- [X] T066 [US4] Wire the credential store, session use cases, connectivity monitor, lifecycle coordinator, and authorization state gate in `apps/tv/app/src/main/kotlin/com/magi/tv/di/AppContainer.kt`, `apps/tv/app/src/main/kotlin/com/magi/tv/MagiTvApp.kt`, and `apps/tv/app/build.gradle.kts`; remove `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET` BuildConfig fields after the legacy migration flag is ready.
- [X] T067 [P] [US4] Add TV unit, MockWebServer, Keystore, Compose UI, and instrumentation tests for refresh concurrency, rotation/replay, encrypted persistence, network backoff, D-pad reachability, focus restoration, Back hierarchy, 401/revoked recovery, and credential redaction in `apps/tv/app/src/test/kotlin/com/magi/tv/data/auth/TokenManagerTest.kt`, `apps/tv/app/src/test/kotlin/com/magi/tv/data/repository/DefaultClientSessionRepositoryTest.kt`, `apps/tv/app/src/androidTest/kotlin/com/magi/tv/platform/security/KeystoreClientCredentialStoreTest.kt`, and `apps/tv/app/src/androidTest/kotlin/com/magi/tv/ui/auth/ClientAuthorizationScreenTest.kt`.
- [X] T068 [US4] Implement and document the time-bounded legacy shared-client migration, including legacy-only playback compatibility, new-install explicit authorization, telemetry/cutoff, and final revocation in `apps/api/src/infrastructure/config/device-client.config.ts`, `apps/tv/app/build.gradle.kts`, `docs/architecture.md`, and `specs/007-client-management-heartbeat/quickstart.md`.

**Checkpoint**: User Story 4 is independently testable with a fresh TV install and a logged-in Web account, including temporary network recovery and terminal reauthorization after revoke.

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete repository-wide quality, security, performance, documentation, and physical-device acceptance after the desired stories pass independently.

- [X] T069 [P] Add structured log redaction and assertions that remove Authorization, Access/Refresh Token, device/user code, complete verification URI, full IP, and playback URL from API/TV logs, diagnostics, and screenshots in `apps/api/src/shared/logging/` and `apps/tv/app/src/main/kotlin/com/magi/tv/data/remote/MagiClient.kt`.
- [X] T070 [P] Update the architecture guide with device-client versus OAuth-client boundaries, RFC 8628 flow, token rotation, heartbeat lifecycle, and TV layer ownership in `docs/architecture.md`.
- [X] T071 Regenerate and verify TanStack route output and OpenAPI output without hand-editing generated files in `apps/web/src/routeTree.gen.ts`, `/api/open.json`, and `apps/api/src/main.ts`; run the contract diff against `specs/007-client-management-heartbeat/contracts/openapi.yaml`.
- [X] T072 Run the complete runnable validation in `specs/007-client-management-heartbeat/quickstart.md`, including two-account isolation, migration checks, concurrency fixtures, secret scan, Web UI states, and revoke-after-heartbeat behavior.
- [X] T073 Record Android TV emulator and at least one physical remote acceptance results for startup authorization, foreground/background heartbeat, offline/recovery, 401, revoke, reauthorization, rapid channel switching, sidebar, overlay focus, and Back hierarchy in `specs/007-client-management-heartbeat/quickstart.md`.
- [X] T074 Run the repository quality gates `pnpm lint`, `pnpm build`, `pnpm --filter @magi/api test`, `pnpm --filter @magi/web test`, `pnpm --filter @magi/backend-core test`, `cd apps/tv && ./gradlew :app:lintDebug :app:testDebugUnitTest :app:assembleDebug`, then resolve all failures before implementation handoff.

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: T001–T005 can start immediately and may run in parallel.
- **Phase 2 (Foundational)**: T006–T022 depends on the setup directories/dependencies and blocks every user story.
- **Phase 3 (US1)**: T023–T033 depends on Phase 2; it is the recommended MVP increment.
- **Phase 4 (US2)**: T034–T044 depends on Phase 2 and can run alongside US1 using seeded device principals.
- **Phase 5 (US3)**: T045–T053 depends on Phase 2 and the US1 list surface for the complete Web demo; API lifecycle tests can begin after Phase 2.
- **Phase 6 (US4)**: T054–T068 depends on Phase 2 and integrates with US1 Web navigation plus US2 heartbeat/session behavior.
- **Phase 7 (Polish)**: T069–T074 depends on all desired stories and generated contract outputs.

### User Story Dependencies

```text
Phase 1 → Phase 2
             ├── US1 (account client list) ──┐
             ├── US2 (heartbeat/presence) ───┼── Polish
             ├── US3 (rename/revoke) ────────┤
             └── US4 (TV auth/recovery) ─────┘
```

- **US1 (P1)**: no story dependency after Phase 2; recommended MVP.
- **US2 (P1)**: no story dependency after Phase 2; uses seeded device-bound token fixtures.
- **US3 (P2)**: API can start after Phase 2; full Web completion uses the US1 table.
- **US4 (P2)**: API grant work can start after Phase 2; full TV/Web demonstration integrates US1 and US2.

### Within Each User Story

- Write the marked tests first and confirm they fail for the missing behavior.
- Implement domain/model and repository behavior before application use cases.
- Implement use cases before controllers, then connect Web/TV UI.
- Run the story checkpoint before beginning dependent UI or migration-cutover work.

## Parallel Execution Examples

### Setup and Foundation

```text
T001, T002, T003, T004, T005 can run in parallel.
After setup: T006, T008, T009, T010, T013, T014, T015, T017 can run in parallel.
T011 and T012 wait for schema tasks; T018 and T019 wait for ports/contracts.
```

### User Story 1

```text
T023 and T024 (API tests) can run in parallel with T029 (Web navigation).
T025–T028 implement the API path; T030–T032 implement and test the Web path.
T033 runs after both API projection and Web contract fixtures exist.
```

### User Story 2

```text
T034 and T035 can run in parallel.
T036–T040 implement/verify the API heartbeat path while T041–T043 implement/verify TV data and scheduling.
T044 runs after both sides expose the contract.
```

### User Story 3

```text
T045, T046, and T051 can begin in parallel after Phase 2.
T047–T050 implement the API lifecycle and audit transaction.
T052 can run after T051; T053 runs after API and Web lifecycle contracts are available.
```

### User Story 4

```text
T054 and T055 can run in parallel.
T056–T059 implement the server grant path while T062 starts the isolated TV credential store.
T060–T061 implement Web approval; T063–T067 complete TV token/session/UI integration.
T068 waits for both server and TV migration behavior.
```

## Independent Test Criteria by Story

- **US1**: Account A can navigate to the left-side client menu and see only its seeded devices with correct fields/statuses and recoverable list states; account B data and secrets never appear.
- **US2**: A seeded active device token can heartbeat repeatedly, recover after network return, become offline after the threshold, and never move back online after a revoke race; playback switching does not create heartbeats.
- **US3**: Account A can rename and confirm-revoke its device; the operation is owner-scoped, atomic, idempotent, audited, and immediately blocks protected requests; account B cannot infer or mutate it.
- **US4**: A fresh TV displays a short code, account A approves it in Web, the TV stores only encrypted rotating credentials, bounded retries recover temporary errors, and revoked/invalid credentials reach a D-pad-safe explicit reauthorization state.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 (T023–T033) using seeded device records.
3. Stop and validate navigation, tenant isolation, list fields, derived status, and UI states.
4. Demo the account client list before enabling TV pairing.

### Incremental Delivery

1. Add US2 heartbeat and server-derived presence; validate with seeded device principals.
2. Add US3 rename/revoke and prove atomic security behavior.
3. Add US4 RFC 8628 pairing, encrypted rotating credentials, and TV recovery.
4. Complete migration cutoff and physical-device acceptance only after all stories pass independently.

### Parallel Team Strategy

After Phase 2, one contributor can own US1 Web/API list, another US2 API/heartbeat, and another US4 TV/auth; US3 API security can proceed in parallel with US1 once the foundational repository ports exist. Integrate only at the contract and generated-route checkpoints.

## Notes

- Every executable task uses the required `- [ ] T###` checklist format.
- `[P]` is used only where files and dependencies permit parallel execution.
- `[US1]`–`[US4]` labels map directly to the four user stories in `spec.md`; setup, foundational, and polish tasks intentionally have no story label.
- Generated files such as `apps/web/src/routeTree.gen.ts` and `/api/open.json` must be regenerated by their owning tools, not hand-edited.
