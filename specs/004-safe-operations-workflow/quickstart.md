# Quickstart Validation Guide: 安全运营工作流

## Purpose

本指南用于在实现完成后验证 [spec.md](./spec.md) 的核心结果。数据结构和状态约束见 [data-model.md](./data-model.md)，HTTP 行为见 [contracts/](./contracts/)。

## Prerequisites

- Node.js ≥ 20、pnpm 10；
- Docker 与 Docker Compose；
- 本地 3000、API、PostgreSQL 和 Redis 所需端口可用；
- 管理员账号通过项目初始化脚本创建；
- 实施阶段提供固定种子的安全运营数据集生成器，支持 1k、10k、50k 三档；
- 浏览器测试使用不含真实凭据的本地来源文件。

## Start the system

```bash
bash scripts/init-dev.sh
pnpm dev
```

确认 Web、API 和 Worker 均启动，并记录一次登录后的管理员会话。

## Quality gate commands

```bash
pnpm lint
pnpm build
pnpm --filter @magi/api test
pnpm --filter @magi/web test
pnpm --filter @magi/worker test
pnpm exec tsc --noEmit -p apps/api/tsconfig.json
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm exec tsc --noEmit -p apps/worker/tsconfig.json
```

Worker 当前尚无 test script；实施任务必须在首次 Worker 用例测试加入时补齐，使以上命令可直接执行。

## Deterministic dataset

实施阶段应提供 `scripts/validation/safe-operations-fixture.ts`，至少支持：

```bash
pnpm exec tsx scripts/validation/safe-operations-fixture.ts seed --channels 10000 --seed 4004
pnpm exec tsx scripts/validation/safe-operations-fixture.ts verify --seed 4004
pnpm exec tsx scripts/validation/safe-operations-fixture.ts reset --seed 4004
```

10k 基准集固定包含：

- 70% 稳定 ID 未变化；
- 10% 改名；
- 5% 来源缺失后重现；
- 5% 重复标识；
- 5% 缺失标识；
- 5% 多来源冲突；
- 人工改名、分组、Logo、台号、EPG lock；
- active/hidden/disabled/trashed；
- 手工和来源线路、有序主备、健康历史。

`verify` 必须全量比较规范化状态和关系，而不是抽样。

## Scenario 1 — 10k M3U sync preview

1. Seed 10k dataset and capture the baseline verification digest.
2. Open M3U sources and request sync preview.
3. Verify current output remains unchanged while preview is preparing.
4. Within 10 seconds, verify summary counts for add/update/missing/preserve/conflict.
5. Filter and paginate change items.
6. Compare every category count with the fixture expectation.

**Expected**: Preview is side-effect free; counts are 100% accurate; blockers explain duplicate/missing identities.

## Scenario 2 — Preserve operator state through sync and EPG match

1. Apply the approved M3U change set.
2. Prepare EPG match with exact, fuzzy, conflict and unmatched candidates.
3. Resolve one conflict manually and lock it.
4. Apply the match change set.
5. Run fixture verification.

**Expected**: All artificial/manual fields, locks, lifecycle states, stream order and health history remain unchanged unless explicitly selected in the preview.

## Scenario 3 — Replay and duplicate submissions

1. Double-submit preview apply with the same Idempotency-Key.
2. Submit the same command with the same key but changed payload.
3. Re-run completed input with a new key.
4. Simulate a stalled worker and allow retry.

**Expected**: Same key returns one TaskRef; changed payload is rejected; completed identical input produces an empty change set; retry does not duplicate audit, recovery or domain effects.

## Scenario 4 — Stale preview and concurrent edits

1. Generate a ready preview.
2. Change one included channel in another browser tab.
3. Apply the old preview.

**Expected**: Apply returns `preview-stale`; zero items are applied; refreshing and regenerating preview succeeds.

## Scenario 5 — Failure injection and atomic apply

Inject failure at:

- before recovery point;
- after recovery point but before apply;
- during candidate preparation;
- before transaction commit;
- after commit before outbox publish.

Restart Worker and retry where permitted.

**Expected**: No partial operational state is visible; recovery point failure produces zero writes; committed state has one audit event and eventually one delivered outbox event.

## Scenario 6 — Lifecycle and trash

1. Move channels through active, hidden, disabled and trashed.
2. Verify each filtered view and output behavior.
3. Sync/match while channels are non-active.
4. Restore each state.
5. Preview and apply permanent purge for a trashed test channel.

**Expected**: Automated operations never reactivate operator states; all reversible states remain reachable; purge is isolated and separately confirmed.

## Scenario 7 — EPG workbench readiness

1. Attempt matching with disabled, failed, empty and stale XMLTV sources.
2. Verify blockers and direct repair actions.
3. Use a healthy source and inspect four result categories.
4. Batch accept safe exact results; manually resolve fuzzy/conflict results.

**Expected**: Invalid sources cannot apply; confidence/reason/source are visible; manual locks survive a second automatic match.

## Scenario 8 — Schedule save/cancel and overlap

1. Edit interval/timezone/enabled, then Cancel.
2. Verify server values did not change.
3. Save a valid draft and verify next run.
4. Trigger now while the same scope task is running.
5. Let the schedule reach another due time during the active task.

**Expected**: Cancel is zero-write; Save is one audited write; trigger-now returns the existing task when deduplicated; scheduled overlap is skipped and audited without a catch-up storm.

## Scenario 9 — Tasks and global status

1. Start tasks for two different sources.
2. Navigate away from task detail.
3. Observe Header summary and return through task link.
4. Retry a failed task and inspect parent/root relation.
5. Attempt cancellation before and during atomic apply.

**Expected**: Different sources run under controlled concurrency; task state is visible globally within 10 seconds; retry relation is explicit; cancellation capability matches the true commit stage.

## Scenario 10 — Stream ordering and failover

1. Configure one primary and two ordered backups.
2. Fail primary for the configured threshold.
3. Verify switch order and audit event.
4. Recover primary under `auto_keep_fallback`, then under `auto_restore_primary`.
5. Run a single-stream check.
6. Delete primary after confirming successor.

**Expected**: Order and policy are deterministic; health changes on one stream only; successor is exactly the previewed stream.

## Scenario 11 — Recovery point round trip

1. Apply a 10k change set.
2. Open the task/audit record and request recovery preview.
3. Apply restore.
4. Run full fixture verification.

**Expected**: Restore finishes within 5 minutes and all affected relationships match the pre-operation digest; restore itself is audited and replay-safe.

## Scenario 12 — Backup compatibility and security

Test:

- current format round trip;
- each supported older format migration;
- future major version;
- corrupted checksum;
- missing reference;
- source URLs/headers containing test token, password, userinfo and sensitive query values.

**Expected**: Unsupported/corrupt inputs stop before writes; current/old supported backups restore through preview; backup, tasks, audit and logs contain no test secret.

## Scenario 13 — Dashboard and repair paths

Create stale M3U/XMLTV sources, low EPG coverage, failed streams and failed tasks.

**Expected**: Dashboard metrics reflect each condition; every issue reaches the affected filtered object and repair action in at most three interactions.

## Capacity observations

Run the preview and apply suite at 1k, 10k and 50k:

| Dataset | Release expectation                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------- |
| 1k      | Fast smoke gate                                                                                      |
| 10k     | All specification performance and consistency criteria pass                                          |
| 50k     | No nonlinear loss of correctness; record time, memory, queue wait and lock wait as capacity evidence |

50k is not a current product SLA and must not be used to weaken the 10k release gate.

## First-use usability validation

Recruit at least 20 authenticated administrators who have not used this feature or read its external documentation. Use a reset fixture and the same task script for every participant; record only anonymous participant IDs and outcomes.

1. Start timing SC-003 only after the matching draft is fully loaded. Stop after the participant identifies the conflict class, corrects one conflict, locks it and saves successfully. At least 19/20 must finish within 2 minutes.
2. Ask the participant to judge the output, automation and recovery behavior of active, hidden, disabled and trashed channels using only in-product explanations. At least 19/20 must answer every state correctly.
3. Give the participant a saved schedule and ask them to edit/save, edit/cancel, disable and re-enable it. At least 19/20 must finish in one attempt with the persisted configuration matching the expected state.

Record recruitment criteria, environment, exact start/stop timestamps, anonymized result per participant, failures and follow-up links in `usability-validation.md`. A failed threshold blocks release; component or end-to-end automation cannot substitute for this first-use evidence.

## Release wave validation

For every delivery wave:

1. Create a pre-wave backup and verify checksum.
2. Run migration/backfill validation with zero unresolved automatic changes.
3. Run shadow preview and compare old/new results.
4. Enable new writes for one small source.
5. Exercise recovery and observe task/error/lock metrics.
6. Expand to the 10k source only after preservation and recovery gates pass.
7. Keep compatibility reads until the contract-cleanup wave.

Stop rollout on any incorrect impact count, lost manual field, orphan relation, duplicate side effect, secret exposure or failed recovery verification.
