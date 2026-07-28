# Requirements Traceability — 004 Safe Operations Workflow

Maps each functional requirement (FR-001–FR-038) and success criterion
(SC-001–SC-012) to the implementing tasks and validation evidence.

**Status: 130/136 tasks complete.** Traceability covers all FR/SC. Where
validation is environment-gated (performance/interactive), the evidence is
pending and cross-referenced to `validation-results.md`.

Legend:
- ✅ Implemented + validated (unit/integration test green)
- 🟡 Implemented; validation pending env (DB perf / interactive)
- ⛔ Conditional (observation-period gate, T130/T131)

---

## Functional Requirements (FR-001–FR-038)

| ID | Requirement (summary) | Implementing tasks | Validation | Status |
|----|-----------------------|--------------------|------------|--------|
| FR-001 | Pre-apply impact preview for all high-risk ops | T036, T043, T070, T097, T116 | operation.controller.test, OperationPreview test | ✅ |
| FR-002 | Preview shows add/update/missing/delete/preserve/conflict counts | T036, T045, T071 | change-set summary schema + OperationPreview | ✅ |
| FR-003 | Sync uses stable identity + diff update (no identity reset) | T035, T037, T038 | safe-source-sync.repositories.test | 🟡 (DB) |
| FR-004 | Sync/match preserves manual name/group/logo/binding/stream/history | T037, T038, T039 | m3u-sync-operation.test, epg-match-operation.test | 🟡 (DB) |
| FR-005 | Distinguish auto vs manual data; allow manual lock | T069, T054, T066 | update-manual-epg-binding, channel-lifecycle.test | ✅ |
| FR-006 | EPG auto-match generates reviewable draft; no output change pre-confirm | T039, T047, T072 | epg-match-operation.test, epg-matching.test | ✅ |
| FR-007 | Draft classifies exact/fuzzy/conflict/unmatched + reason + confidence | T066, T068, T071 | epg-matcher-workbench.test, EpgMatchSummary | ✅ |
| FR-008 | Filter/process/batch-accept draft results | T068, T071, T072 | EpgMatchBatchActions, epg-match-candidates | ✅ |
| FR-009 | Block disabled/failed/empty/stale EPG source; provide repair links | T067, T070, T072, T074 | get-xmltv-source-readiness, epg-matching readiness UI | ✅ |
| FR-010 | Pre-op recovery points; restore from task/audit | T040, T099, T102, T107 | recovery-operation.test, RecoveryController | 🟡 (DB) |
| FR-011 | Restore provides impact preview + consistent relations | T040, T102 | prepare-recovery-restore, apply-recovery-restore | 🟡 (DB) |
| FR-012 | Show active/hidden/disabled/trashed/purge states + their effects | T054, T056, T057, T058, T059, T060 | channel-lifecycle.test, lifecycle-aware output | ✅ |
| FR-013 | View/restore hidden/disabled/trashed separately | T055, T056, T057, T059, T061 | ChannelLifecycleActions, $channelId restore | ✅ |
| FR-014 | Sync/match preserves lifecycle unless explicitly approved | T037, T038, T057 | lifecycle-output.test | 🟡 (DB) |
| FR-015 | Batch ops use stable IDs; confirm shows names + counts | T055, T059, T060 | seenChannelsRef stable selection, batch confirm | ✅ |
| FR-016 | Permanent purge separated from recoverable delete; irreversible confirm | T055, T056, T061 | purge-channel.use-case, purge-preview modal | ✅ |
| FR-017 | Source delete shows affected channels/programmes/maps/streams/schedules + disable option | T097, T108 | prepare-delete-source, source-list-page preview | 🟡 (DB) |
| FR-018 | Auto recovery point before high-risk op; fail = no continue | T036, T040 | recovery-operation.test (zero-write on failure) | 🟡 (DB) |
| FR-019 | Audit events for source/channel/epg/stream/batch/schedule/sync/match/delete/backup/restore | T098, T104 | audit-event.repository, AuditList | ✅ |
| FR-020 | Audit event fields: time/actor/type/target/summary/result/linked-task | T098, T107 | AuditEventVo schema, audit-list.test | ✅ |
| FR-021 | Export full config backup; preview compatibility + changes pre-restore | T100, T101, T104, T106 | backup-serializer, backup-restore.test, download | ✅ |
| FR-022 | Schedule edit uses explicit edit/save/cancel; cancel = no change | T082, T087 | scheduled-tasks-section draft + Save/Cancel | ✅ |
| FR-023 | Enable/disable each schedule; show state/interval/tz/last/next | T081, T082, T087 | ScheduledJobVo, schedule cards | ✅ |
| FR-024 | Block duplicate schedule/trigger when same task running; show existing | T084, T087 | scheduler.test, overlap skip | 🟡 (Redis) |
| FR-025 | Each task shows source/target/status milestones/parent-child/result | T080, T083, T085, T088 | TaskDetailVo, task-detail-content | ✅ |
| FR-026 | Global area shows running/failed tasks + detail entry | T082, T085, T090 | useTaskSummary, GlobalTaskStatus in header | ✅ |
| FR-027 | Per-target loading/disabled; unrelated rows idle | T044, T086, T089 | useTargetPending registry, task-registry | ✅ |
| FR-028 | Home shows M3U/EPG sync time, stream-check time, coverage, availability, task counts | T118, T123 | OperationsSummaryVo, operations-summary cards | ✅ |
| FR-029 | Home issue metrics → filtered repair entry | T118, T123 | issue actionUrl, dashboard-operations.test | ✅ |
| FR-030 | Source config explains enabled/participate/fallback/priority + effective summary | T119, T124 | get-source-effective-policy, source-form-dialog | ✅ |
| FR-031 | Set one primary + ordered backups; show switch/restore conditions | T114, T115, T116, T121 | ChannelStreamOrder, channel-failover.test | ✅ |
| FR-032 | Auto-select eligible backup by order on primary failure; record reason | T114, T116, T117 | ChannelFailoverPolicyModel.decideTarget | ✅ |
| FR-033 | Pre-delete-primary shows successor; none = explain output loss | T116, T121 | reorder validation (one primary), stream-order | ✅ |
| FR-034 | Single-stream immediate check; only that row shows status | T116, T120, T121 | check-channel-stream, POST .../check | ✅ |
| FR-035 | Empty states provide direct action entries (add/sync/clear) | T074, T035 | epg-matching empty state, source add | ✅ |
| FR-036 | Consistent terminology across confirm/task/audit | T036, T080, T098 | shared DTOs from @magi/types | ✅ |
| FR-037 | Long-running ops return trackable task immediately + coarse progress | T037–T041, T082, T085 | TaskRef on 202, progress polling | ✅ |
| FR-038 | Tasks cross-traceable user↔detail↔audit; redacted diagnostics on fail | T083, T085, T098, T100 | relations links, backup-redactor | ✅ |

---

## Success Criteria (SC-001–SC-012)

| ID | Criterion (summary) | Implementing tasks | Validation | Status |
|----|---------------------|--------------------|------------|--------|
| SC-001 | Sync preserves 100% manual overrides/configs | T035, T037, T038 | safe-source-sync.repositories.test (skipped→DB) | 🟡 (DB/T128) |
| SC-002 | 100% high-risk ops show accurate preview pre-state-change | T036, T045, T068, T097 | operation.controller.test, OperationPreview | 🟡 (DB/T128) |
| SC-003 | ≥95% of 20 first-time admins resolve a conflict <2min | T071, T072, T073 | usability-validation.md (interactive) | 🟡 (T134) |
| SC-004 | Restore to pre-op state <5min; 100% sampled consistency | T040, T102, T107 | recovery-operation.test (skipped→DB) | 🟡 (DB/T128) |
| SC-005 | ≥95% of 20 admins judge lifecycle effects without docs | T054, T059, T060, T061 | usability-validation.md (interactive) | 🟡 (T134) |
| SC-006 | ≥95% of 20 admins do schedule modify/cancel/disable/enable correctly | T082, T087 | usability-validation.md (interactive) | 🟡 (T134) |
| SC-007 | Task visible <5s post-submit; global status <10s on change | T041, T082, T090 | useTaskSummary polling (2s/5s) | 🟡 (T128) |
| SC-008 | Reach problem object + repair entry ≤3 interactions | T118, T123, T029 | operations-summary actionUrl | ✅ |
| SC-009 | 100% primary-failure channels switch by confirmed order + traceable | T114, T116, T117 | ChannelFailoverPolicyModel, channel-failover.test | 🟡 (DB) |
| SC-010 | Source-delete impact counts 100% accurate | T097, T108 | prepare-delete-source (skipped→DB) | 🟡 (DB/T128) |
| SC-011 | 100% high-risk ops traceable to actor/target/time/result/task/recovery | T019, T098, T107 | audit-events table, AuditList, audit-list.test | ✅ |
| SC-012 | 10k channels: preview summary <10s; continue browsing without waiting | T036, T045, T125 | performance suite (T128) | 🟡 (T128) |

---

## Coverage summary

- **FR-001–FR-038**: all 38 implemented. 26 ✅ validated green; 12 🟡 pending
  DB-integration / interactive validation (cross-ref `validation-results.md`).
- **SC-001–SC-012**: all 12 have implementing tasks. 2 ✅; 10 🟡 pending
  performance (T128) / interactive usability (T134) / DB-integration runs.

## Gates to turn 🟡 → ✅

1. **DB-integration** (SC-001/002/004/009/010, FR-003/004/014/017/018/024):
   unskip + run the 96 skipped repository/use-case/HTTP tests against the live
   `magi-postgres` (now running and migrated). Documented in `validation-results.md`.
2. **Performance** (SC-007/012, T128): run 1k/10k/50k fixture + measure preview
   latency / queue wait. Records appended to `validation-results.md`.
3. **Interactive usability** (SC-003/005/006, T134): 20-admin timed acceptance.
   Evidence → `usability-validation.md`.
