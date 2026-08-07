# Data Model: M3U 控制台

## M3U Source

管理者维护的上游播放列表。

| Field | Rules |
|---|---|
| id | 稳定主键。 |
| owner / display name | 仅所属管理者可管理；名称用于识别。 |
| URL and request configuration | 仅受保护保存；不会出现在普通响应、审计或日志中。 |
| role / priority / enabled / participateInOutput / allowFallback | 决定来源在编排和输出中的自动资格。 |
| source health | 独立于线路健康；记录最近成功、失败、内容指纹和错误摘要。 |
| version | 来源配置改变时递增，阻止将陈旧快照应用到新配置。 |

## Source Snapshot and Change Set

`SourceSnapshot` 是一次下载和解析产生的不可变输入；`ChangeSet` 是该输入相对当前来源频道的可应用决定。

| State | Meaning | Allowed next state |
|---|---|---|
| preparing | 正在下载、解析和计算差异。 | ready, failed |
| ready | 正常可自动应用，或异常等待确认。 | applying, expired, cancelled |
| applying | 正在进行原子变更。 | applied, failed |
| applied | 已写入来源频道、编排和发布投影。 | restored |
| failed / expired / cancelled / restored | 终态。 | — |

**Rules**:

- 同一来源和同一输入指纹复用未过期结果，不重复写入。
- 当前可见条目数大于零时，空快照或缺失比例 ≥25% 标为 `requiresConfirmation`。
- 快照必须保存来源配置版本；版本不匹配时不得应用。

## Source Channel

来源内的稳定频道条目。身份在该来源内唯一，包含自动名称、分组、`tvg-id`、台标与当前播放地址。

| State | Meaning |
|---|---|
| present | 这次快照中存在，可参与自动成员和来源线路编排。 |
| missing | 上游未报告；自首次缺失起保留 30 天，不参与输出。 |
| purged | 到期后从活动编排中清除，快照与审计仍可追溯。 |

再次出现的同一来源身份必须复用现有记录、成员和来源线路的身份与健康历史。

## Canonical Channel and Overrides

`CanonicalChannel` 是播放器看到的稳定频道。它可以拥有多个成员和线路，且不因任一来源更新而重新创建。

人工覆盖必须按字段记录来源和锁定状态，至少覆盖名称、分组、台标、频道号、可见性、生命周期、主线路、线路顺序、故障切换资格和手动 EPG 绑定。同步只更新未锁定的自动字段。

输出资格：频道生命周期为 active，且至少有一条当前可输出的来源线路或手动线路。

## Canonical Channel Member and Merge Candidate

`CanonicalChannelMember` 连接来源频道与最终频道。

- `automatic`：仅由相同、非空、规范化 `tvg-id` 创建。
- `manual`：管理者接受候选或明确建立的关系。
- 成员可激活或停用；来源缺失时停用自动成员，恢复时重新激活。

`MergeCandidate` 保存弱信号候选：来源频道、目标最终频道、候选方法、理由/置信度、输入指纹、状态和审查人。

| State | Meaning |
|---|---|
| pending | 等待管理者处理；不影响输出。 |
| accepted | 建立 manual 成员关系。 |
| rejected | 对相同输入抑制重复建议。 |
| stale | 来源/目标已经变化，不能再直接处理。 |

## Channel Stream

最终频道的一条播放线路。

- 来源线路绑定一个来源频道；手动线路不绑定来源频道。
- 来源频道变为 missing 时，来源线路保留 30 天、不可输出；手动线路不受此规则影响。
- 保存排序、是否主线路、是否允许自动故障切换、聚合健康状态和连续成功/失败计数。
- 线路地址变化但来源频道身份不变时，保留线路身份和健康历史，并记录地址修订。

## Stream Health Observation and Failover Event

`StreamHealthObservation` 是不可变证据，类型为 `active_probe` 或 `playback_report`，记录结果、时间、错误分类、时延、关联任务及可选设备。

`FailoverEvent` 记录一次自动或人工主备变化：频道、原主线路、新主线路、触发来源、原因和时间。

聚合动作以观察记录为输入，更新 `ChannelStream` 健康字段，并在同一事务中更新主线路和策略状态。频道默认策略为连续失败 3 次、连续成功 2 次、冷却 60 秒；管理者可按频道覆盖。

## Output Grant and Output Publication

`OutputGrant` 是每个播放器或设备唯一的可撤销输出资格。

- 保存持有者、显示名称、可选关联设备、权限范围、状态、到期/撤销时间、最近使用时间、密钥前缀和密钥哈希。
- 创建或轮换时只显示一次明文 URL 凭据；持久化层不保存明文。

`OutputPublication` 是动态输出的状态投影而非文件，记录 revision、最后成功发布时间、总频道数、可播放频道数、排除数、`fresh | stale | blocked` 状态及原因。任何成功应用、编排变更、可输出线路变化或异常阻塞都会更新该投影。
