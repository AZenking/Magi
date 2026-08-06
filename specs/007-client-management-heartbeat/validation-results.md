# Validation Results: 客户端管理与心跳 (007)

**Date**: 2026-08-03
**Branch**: `feat/004-safe-operations-and-protable`

## T072: Automated Validation Results

### Migration Checks (§2)

- 0003–0010 migrations applied to `magi_test` database successfully.
- `device_clients` table (18 columns), `oauth_clients`, `oauth_access_tokens`,
  `device_refresh_tokens`, `audit_events`, `outbox_events` all present.
- No `user`/`session`/`account`/`verification` table dropped/recreated/renamed.
- `oauth_clients.client_kind` default `confidential`; new device tables have
  real FKs, unique constraints, and specified indexes.
- `oauth_access_tokens.device_client_id` nullable for legacy rows.
- `user.role` default `'user'`; seed account synchronized to `admin`.

### Contract & Type Validation (§3)

```
pnpm --filter @magi/api build      ✅
pnpm --filter @magi/api lint        ✅ (via pnpm lint)
pnpm --filter @magi/api test        ✅ 314 passed / 74 skipped / 0 failed
```

### PostgreSQL Concurrency Validation (§4)

```
pnpm --filter @magi/api test -- device-heartbeat.integration     ✅ 7 tests
pnpm --filter @magi/api test -- device-client-lifecycle.integration ✅ 9 tests
pnpm --filter @magi/api test -- device-client-list.integration    ✅ 6 tests
```

Key results:
- 100 concurrent heartbeats → 0 duplicate devices, `lastHeartbeatAt` monotonic.
- 50 heartbeat + 1 revoke race → final state 100% revoked.
- Revoke atomically commits device + access tokens + refresh tokens + audit.
- 150s boundary: exactly 150s = online, 151s = offline, revoked always wins.
- List P95 at 200-client scale < 2s (load harness at 1000 clients also < 2s).

### Web Validation (§5)

```
pnpm --filter @magi/web test        ✅ 61 passed / 13 skipped / 0 failed
pnpm --filter @magi/web build       ✅
pnpm --filter @magi/web lint        ✅ (via pnpm lint)
```

- Rename modal: pre-fill, trim validation, success/failure behavior, pending guard.
- Revoke modal: terminal-state copy, cancel, confirm, success/failure, null guard.

### Android TV Automated Gates (§10)

```
./gradlew :app:testDebugUnitTest       ✅ 37 tests
./gradlew :app:lintDebug               ✅
./gradlew :app:assembleDebug           ✅
./gradlew :app:connectedDebugAndroidTest ✅ 5 passed / 2 skipped
```

- KeystoreClientCredentialStoreTest: 5/5 (encryption round-trip, clear,
  idempotent installation id, overwrite).
- ClientAuthorizationScreenTest: @Ignore (API 36 emulator Compose-test-rule
  incompatibility; D-pad/focus covered by T073 physical acceptance).
- TokenManagerTest: 8 tests (save, family/generation, validation,
  hasCredentials, clearCredentials, StateFlow).
- ClientAuthorizationViewModelTest: 6 tests (Loading/Authorized/Failed,
  idempotent start, retry).
- HeartbeatAcceptanceTest: 4 tests (on-start immediate, channel-switch
  agnostic, network coalescing, 60s cadence).

### Repository-Wide Final Gates (§12)

```
pnpm lint                             ✅ 9/9 tasks
pnpm build                            ✅ 6/6 tasks
pnpm --filter @magi/api test          ✅ 314 passed
pnpm --filter @magi/web test          ✅ 61 passed
cd apps/tv && ./gradlew lintDebug testDebugUnitTest assembleDebug  ✅
```

### Secret Scan (§12)

Scanned `apps/api/dist` and `apps/web/dist` for
`Authorization: Bearer|refresh_token|device_code|client_secret` patterns.

Result: **0 real secrets found.** All pattern matches are:
- Test fixture grant-type constants (`device_code`).
- Code identifiers (`rotate_oauth_client_secret_use_case`).
- Redactor regex patterns (`access_token|refresh_token` in backup-redactor).
- Type definition comments (`client_secret` format documentation).

No actual token values, API keys, or playback URLs appear in any build artifact.

## T073: Physical Device Acceptance

See quickstart.md §11 for the acceptance table. Emulator (JVM + Keystore
instrumentation) results recorded; physical remote device rows marked
"待人工执行" with the specific manual steps required.

### Items Requiring Physical Device

1. **首次自动登记**: Boot fresh TV build, verify auto-registration to default
   account, verify Web shows the device.
2. **D-pad/Back focus hierarchy**: Verify all actions reachable via
   directional keys, Back does not bypass reauthorization.
3. **真实 401/revoked recovery**: Connect TV to a server with a revoked
   device, verify "设备访问已撤销" message and D-pad retry.
4. **快速换台 (真机)**: Rapid channel switching on a real device with
   heartbeat counting.
