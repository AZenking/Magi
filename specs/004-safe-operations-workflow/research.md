# Phase 0 Research: 安全运营工作流

## 1. 高风险操作协议

**Decision**: 来源同步、EPG 匹配、永久删除、批量生命周期变更和恢复统一采用 `Preview → Confirm → Async Apply`。Preview 无副作用，保存不可变输入 fingerprint、目标版本、影响统计、warnings、blockers 和过期时间；apply 只引用 change set，不重复提交可能漂移的原始参数。

**Rationale**: 用户确认的内容必须与实际执行内容一致；异步边界符合重任务宪法；统一协议减少各页面独立实现确认逻辑的漂移。Apply 前重新校验目标版本、输入 fingerprint 和 blockers。

**Alternatives considered**:

- `dryRun=true` 后重复提交原命令：两次 payload 可能变化，无法证明执行内容就是预览内容。
- 普通确认框后直接执行：只能防误触，无法发现数据版本变化。
- 同步等待整个操作：不适合 10k 数据和任务重试。

**References**: [Kubernetes API dry-run](https://kubernetes.io/docs/reference/using-api/api-concepts/), [RFC 9110 — 202 Accepted](https://www.rfc-editor.org/rfc/rfc9110.html)

## 2. 来源频道采用稳定身份差异更新

**Decision**: 保留现有 `channelIdentity` 作为来源内稳定业务键，将同步从 delete/recreate 改为 upsert：新增不存在身份、更新已存在身份、将未出现身份标为 missing/disappeared，不改变已有频道 ID。

**Rationale**: 稳定数据库身份使现有 override、canonical membership、stream source binding 和检查历史自然保留。来源缺失是事实状态，不应等价于运营删除。

**Alternatives considered**:

- 继续删除并重建后重新挂接：需要猜测旧新关系，错误恢复成本高。
- 仅依赖 URL：URL 变化常见，不能承担频道身份。
- 仅依赖 `tvg-id`：真实来源中可能重复或缺失，必须沿用解析器的复合稳定身份并报告冲突。

## 3. 标准频道使用持久成员关系而非全量重建

**Decision**: 标准频道保留稳定 ID，新增标准频道成员关系连接标准频道和来源频道稳定身份。增量合并根据现有成员、merge key 和人工决定更新成员关系；`mergedFromIds` 在迁移期兼容读取，最终由规范化关系替代。

**Rationale**: 标准频道是人工配置、线路和输出的聚合根，其 ID 不能随 EPG 匹配变化。成员关系支持一个标准频道对应多个来源，并可表达加入、移除和来源缺失。

**Alternatives considered**:

- 每次匹配全量重建：会级联删除线路并重置人工状态。
- 只给 canonical 增加稳定 key：成员变化可能改变 key，且不能表达多来源关系历史。
- 长期保存 JSON 字符串成员：查询、约束和迁移困难。

## 4. 人工覆盖与自动结果分离

**Decision**: 继续使用现有 channel override 作为人工字段真相源；非空人工名称、分组、Logo、台号和 EPG 绑定优先于自动值。增加明确的人工 EPG lock 和决定来源；自动任务只更新自动候选，不直接覆盖人工决定。

**Rationale**: 项目已经有 override 模型，扩展它比建立第二套人工配置表更简单。人工 lock 解决“手工绑定后被自动匹配重写”的核心风险。

**Alternatives considered**:

- 在 canonical 当前值上判断是否人工修改：无法可靠区分自动值与人工值。
- 所有字段一个全局 lock：过于粗糙，用户可能只想锁 EPG。
- 每个字段建立独立事件流：当前单管理员规模下过度设计。

## 5. 变更集、恢复点和审计分层

**Decision**: ChangeSet 保存将要发生什么，RecoveryPoint 保存受影响对象的操作前状态，AuditEvent 保存谁在何时做了什么及结果。恢复点按对象逐项保存版本化快照，不做每次整库复制；恢复也生成新的 change set 和审计事件。

**Rationale**: 三者生命周期不同：草案会过期，恢复点按保留策略清理，审计记录长期追加。逐对象快照能支持 10k 频道并减少无关数据复制。

**Alternatives considered**:

- 每次整库备份：简单但写放大、恢复范围和审计粒度过大。
- 仅保存 inverse command：当规则版本变化或原对象不存在时不可靠。
- 将快照正文全部复制进审计：体积大且增加敏感信息泄露面。

## 6. 乐观并发与全有或全无应用

**Decision**: 可变资源提供 `version/ETag`，覆盖性更新要求 `If-Match`；preview 保存目标版本集合。Apply 时任一目标漂移则整体返回 stale/conflict，不进行部分应用。

**Rationale**: 单管理员仍可能通过多标签页、调度和后台任务并发修改。版本前置条件能避免 lost update；高风险批处理全有或全无更符合用户确认语义。

**Alternatives considered**:

- Last-write-wins：可能静默覆盖人工配置。
- 使用 `updatedAt` 比较：精度和序列化语义不稳定。
- 自动字段级合并：冲突规则复杂，高风险操作应重新预览。

**References**: [RFC 9110 conditional requests](https://www.rfc-editor.org/rfc/rfc9110.html)

## 7. 幂等与并发采用双层防护

**Decision**: 非幂等命令要求 Idempotency-Key；入队使用 `{operation}:{targetStableId}:{inputVersion}` 去重；业务层以持久 change-set 状态和目标范围租约原子判定。同 key/同 payload 返回原 TaskRef，同 key/不同 payload 返回冲突。同一目标的同步、匹配、恢复和 purge 互斥，不同来源可并发。

**Rationale**: BullMQ 任务可能重试或 stalled 后重放，队列去重并不等于 exactly-once。最终正确性来自不可变输入、业务幂等、目标范围互斥、恢复点和可重放 worker。

**Alternatives considered**:

- 只禁用前端按钮：无法覆盖网络重试、多标签页和代理重放。
- 只使用 queue jobId：任务清理后不能承担长期业务幂等。
- 全运营队列并发设为 1：互不相关来源会不必要地互相阻塞。

**References**: [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs), [BullMQ deduplication](https://docs.bullmq.io/guide/jobs/deduplication), [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids)

## 8. Task 作为一等资源，全局状态先使用轮询

**Decision**: TaskRef 统一提供目标 scope、display name、status URL 和提交时间；详情增加 stage、结构化 progress、能力、result summary、错误、parent/retry 关系。Web 在存在非终态任务时以 2–5 秒轮询，无任务时降频或停止，恢复焦点后刷新；暂不引入 SSE/WebSocket。

**Rationale**: 轮询能满足规格的 5/10 秒反馈目标，沿用现有 TanStack Query 和 Task API，复杂度低且适合单管理员。单个 mutation 状态以 taskId/target key 隔离。

**Alternatives considered**:

- SSE/WebSocket：更实时，但增加连接、重连、鉴权和 SSR 边界。
- 仅使用 toast：离开页面后不可追踪。
- 页面各自维护 pending：刷新和跨页面后状态不一致。

## 9. 调度配置持久化并默认跳过重叠

**Decision**: 调度的 enabled、间隔/表达式、时区、overlap policy、版本和运行摘要使用持久真相源；BullMQ scheduler 是执行投影。UI onChange 只改草稿，Save 使用版本前置条件，Cancel 完全丢弃草稿。默认 `overlapPolicy=skip`，跳过结果进入任务/审计摘要。

**Rationale**: 当前队列元数据不能完整承担可编辑、可审计配置；显式保存使页面语义和运行行为一致。跳过重叠避免同步风暴。

**Alternatives considered**:

- 选择即保存：取消语义失真。
- 允许同类任务并发：会争用同一来源并产生覆盖风险。
- 到点后无限排队补跑：故障恢复后可能集中触发过期同步。

**References**: [BullMQ job schedulers](https://docs.bullmq.io/guide/job-schedulers)

## 10. 频道采用单一生命周期

**Decision**: 统一为 `active | hidden | disabled | trashed`。普通删除进入 trash，永久 purge 独立建模。生命周期与 `sourcePresence`、人工锁和健康状态正交；所有状态可筛选和恢复。

**Rationale**: 多个 hidden/disabled/deleted 布尔值会产生非法组合，导致隐藏后无法恢复、删除后又被重建。状态机能定义清晰的输出和自动处理行为。

**Alternatives considered**:

- 保留多个布尔字段：兼容简单但长期语义含混。
- 删除即物理删除：不可恢复且无法防止下次匹配重建。
- 来源缺失时自动 disabled：混淆外部事实与运营意图。

## 11. 有序线路与故障转移策略

**Decision**: 每条线路拥有唯一 position、origin 和 failover eligibility；每个标准频道最多一个 primary。频道级 policy 定义 `manual_only | auto_keep_fallback | auto_restore_primary`、失败阈值和恢复阈值。即时检查只创建单线路 task。

**Rationale**: 现有 `isPrimary` 只能表达一个当前选择，无法决定删除主线路后的接替顺序或自动切换。显式顺序与 policy 可预测、可展示、可审计。

**Alternatives considered**:

- 继续使用查询返回第一条线路：排序未形成业务契约。
- 仅按来源 priority 自动决定：人工线路和频道级例外无法表达。
- 每次失败随机选择健康线路：不可预测且难排障。

## 12. 备份协议版本化、默认脱敏

**Decision**: 配置备份带 formatVersion、应用版本、创建时间、范围、记录计数、能力标志和完整性摘要；默认排除密码、token、cookie、连接串、任务过程日志和实时健康采样。恢复先验证完整性、兼容性和引用关系，再生成 preview；apply 前创建本地 recovery point。

**Rationale**: 整库导出容易泄密并与数据库版本耦合。显式协议支持逐版本迁移和可测试的 round trip。

**Alternatives considered**:

- 原样整库导出：恢复直接但跨版本脆弱、泄露面大。
- 忽略未知字段尽量导入：可能静默丢失语义。
- 默认携带加密凭据：密钥管理复杂且超出当前需求。

**References**: [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

## 13. 测试与发布采用确定性数据集和渐进切换

**Decision**: 建立固定种子的 1k/10k/50k 数据集，覆盖稳定 ID、改名、缺失、重复、删除后重现、多来源冲突和所有人工状态。验证影响计数、全量规范化状态、同输入重放、故障注入和性能。发布使用 expand → backfill/validate → shadow preview → enable write → contract。

**Rationale**: 抽样无法证明规格要求的 100% 人工状态保留。Shadow 能在改变输出前对比新旧路径，渐进迁移保留回退空间。

**Alternatives considered**:

- 随机生产镜像：不可复现且有敏感数据风险。
- 只测 happy path：漏掉最危险的重复/缺 ID 分支。
- 一次性切换：旧数据映射错误时缺少回退路径。

**References**: [Parallel Change](https://martinfowler.com/bliki/ParallelChange.html)

## 14. 解析输入先形成隔离候选快照，apply 原子可见

**Decision**: 下载和解析发生在 prepare 阶段，结果进入与当前运营状态隔离的版本化候选快照；diff 和 apply 引用同一个候选 revision。网络和解析不占用业务写事务；apply 在目标范围内以单一事务原子提交。任务只能在事务提交点前取消，进入原子提交阶段后明确显示不可取消。

**Rationale**: 避免预览后重新下载产生 TOCTOU 差异，也避免把网络时间放入长事务。原子可见保证用户不会看到半同步或半匹配状态。

**Alternatives considered**:

- 解析时直接写当前表：无法可靠预览或回滚。
- Apply 时重新下载：实际输入可能已经不是用户确认的版本。
- 每 N 行提交并允许中途取消：会产生混合 revision。

**References**: [Drizzle transactions](https://orm.drizzle.team/docs/transactions), [Drizzle upsert](https://orm.drizzle.team/docs/guides/upsert)

## 15. 审计与业务状态同事务，异步副作用使用 outbox

**Decision**: Apply、生命周期和调度保存把业务状态、审计事件和待发布 outbox event 放在同一事务中提交。事务外的通知、缓存失效和后续任务通过 outbox 可靠消费；审计事件只追加，不更新历史。

**Rationale**: 防止“业务已变但审计/通知丢失”或“通知成功但业务回滚”。审计表达业务意图，结构化日志表达运行诊断，两者不能互相替代。

**Alternatives considered**:

- 业务提交后直接发消息：存在双写不一致窗口。
- 只依赖应用日志：日志会轮转且缺少稳定业务查询模型。
- 数据库触发器记录所有行：缺少操作者、原因、change set 和任务语义。

## 16. Drizzle schema 与 Worker 分层采用单一边界

**Decision**: Drizzle 表定义只存在于 `packages/backend-core/src/database/schema`，API 与 Worker 只能导入或 re-export。Worker 的 application use case 仅依赖 Worker domain ports 与 `packages/backend-core` 的纯算法；Drizzle、BullMQ、下载器和文件系统实现全部位于 Worker infrastructure，processor 只校验 payload 并转交 application。

**Rationale**: 在 API 和共享 package 双写 schema 会让迁移与运行时模型漂移；Worker application 直接访问 Drizzle/BullMQ 会违反项目宪法并使重任务无法隔离测试。

**Alternatives considered**:

- API 与 package 人工同步 schema：短期简单，但没有可靠的一致性边界。
- Worker use case 直接导入 Drizzle：代码少，但领域规则与存储技术绑定。

## 17. 保留期与租约回收使用明确默认值

**Decision**: 可恢复删除、recovery point 和配置备份默认保留 30 天；preview/change set、来源 snapshot 和 idempotency record 默认保留 24 小时；operation lease 默认 TTL 为 2 分钟并每 30 秒续租。部署可以延长这些期限，但幂等记录不得短于 24 小时。审计事件不自动清理。

**Rationale**: 只有 `expiresAt` 而没有默认值会让清理任务、UI 提示和 purge 门禁各自猜测。租约必须同时具备短 TTL 和活动任务复核，才能避免永久死锁与误抢占。

**Alternatives considered**:

- 完全由部署者配置且无默认值：首次部署行为不可预测。
- 仅依赖 Redis/BullMQ 锁：无法覆盖队列状态丢失或跨重启业务互斥。

## 18. 配置备份使用私有文件存储 port

**Decision**: `BackupObjectStorage` port 在 `packages/backend-core` 定义一次，由 API/Worker 各自的 infrastructure adapter 共同消费并访问同一服务端私有存储根；首个 adapter 使用临时文件、checksum/size 校验、fsync 和原子 rename，数据库只保存 opaque `storageRef`。下载必须经过授权 use case；过期删除失败进入可重试清理，不提前把元数据标记为已删除。

**Rationale**: 备份可能较大且包含敏感运营配置，不适合进入数据库正文或公开静态目录。Port 保持 application 与 Node 文件系统解耦，也为未来对象存储保留替换空间。

**Alternatives considered**:

- 把完整备份存入 PostgreSQL：事务与数据库体积压力较大。
- 写入公开下载目录：绕过授权并暴露稳定文件路径。

## Research Resolution

所有 Technical Context 项均已确定，没有待澄清决策。现有技术栈可完成设计，不新增运行时依赖；研究假设与 feature spec 的单管理员、后台任务和默认无凭据备份保持一致。
