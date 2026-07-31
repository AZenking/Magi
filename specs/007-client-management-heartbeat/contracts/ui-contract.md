# UI Contract: 账户客户端管理与 TV 自动登记

**Feature**: [客户端管理与心跳](../spec.md)
**API Contract**: [openapi.yaml](./openapi.yaml)

## Web Navigation Contract

```text
顶栏分区：账户
└── 左侧菜单：客户端管理
    ├── /dashboard/account/clients
    └── /dashboard/account/clients/authorize（兼容旧书签，展示管理页）
```

- `/dashboard/account/*` 必须激活 `account` 顶级 section。
- 左侧“客户端管理”在列表和兼容旧书签页保持选中。
- “开放接口 → 客户端凭证”继续指向 `/dashboard/oauth-clients`，不得改名或复用。
- Breadcrumb:
  - 列表：`账户 / 客户端管理`
  - 兼容旧书签：`账户 / 客户端管理`

## Web Client List

### Header

- Title: `账户 · 客户端管理`
- Description: `查看自动登记设备的在线状态，并撤销不再使用的客户端。`
- No primary binding action; TV 启动后自动登记到默认账户。页面不提供授权码输入、新建 Secret 或删除操作。

### Columns

| Column   | Content                             | Privacy                  |
| -------- | ----------------------------------- | ------------------------ |
| 名称     | `displayName`                       | 可重命名                 |
| 设备     | `identitySummary` + `deviceType`    | 不含 MAC/完整 IP/广告 ID |
| 平台     | `platform` + `platformVersion`      | 非敏感摘要               |
| 应用版本 | `appVersion`                        | 可由心跳推进             |
| 首次注册 | 本地化 `registeredAt`               | 使用语义时间             |
| 最后活跃 | 本地化 `lastActiveAt` 或 `从未心跳` | 精确时间可访问           |
| 状态     | 文字 Tag：在线/离线/已撤销          | 不只依赖颜色             |
| 操作     | 重命名、撤销访问                    | 已撤销无操作             |

### Status presentation

| Status    | Label  | Semantic color | Explanation                  |
| --------- | ------ | -------------- | ---------------------------- |
| `online`  | 在线   | success        | 最近 150 秒内收到心跳        |
| `offline` | 离线   | default        | 无心跳或超过在线窗口         |
| `revoked` | 已撤销 | error          | 访问已终止，不能恢复原客户端 |

服务端负责排序。Web 不自行重排跨页数据。

### Data states

- **Initial loading**: Page skeleton/table loading，不先显示空状态。
- **Empty**: Empty + `尚无已绑定客户端` + `在 TV 上打开 MAGI，设备会自动登记到默认账户；完成后刷新此页面。`
- **Initial error**: Result/Alert 显示 `客户端列表加载失败` 与主操作 `重试`。
- **Background refresh**: 页面可见时每 10 秒刷新，window focus 立即刷新。
- **Stale/error after data**: 保留旧 rows，显示 `展示截至 {timestamp} 的数据，刷新失败`，
  提供重试；不得把未知状态改成在线。
- **Pagination**: 默认 20，支持 20/50/100；换页保留前一页直到新数据完成。

## Automatic registration flow

1. TV 首次启动生成并持久化安装标识。
2. TV 调用自动注册接口，服务端按配置的默认管理员账户创建或复用客户端并签发凭据。
3. TV 加密保存刷新凭据，随后由前台协调器按 60 秒周期发送心跳。
4. Web 客户端管理页刷新后显示设备、在线状态和最后活跃时间；用户无需输入授权码。

旧版授权码接口和兼容 URL 可保留用于迁移，但不属于默认 UI 流程。

## Web Rename Contract

- 操作按钮必须有可见文字或 `aria-label="重命名 {name}"`。
- Modal 预填现名；失焦不自动提交。
- 空白、>64 字符、控制字符显示 inline error。
- 提交时 trim；重复名称允许。
- 失败保留用户输入和 Modal；成功关闭、提示并 invalidate 全部 client list queries。
- Modal 关闭后焦点返回对应行的重命名按钮。

## Web Revoke Contract

确认内容必须同时展示目标名称和以下影响：

> 撤销后该设备立即失去访问权限并停止心跳。自动登记不会复活已撤销记录。

- Button label: `撤销访问`；danger；pending 时 loading 且不可重复提交。
- Cancel 是默认安全路径。
- 成功后 row 状态为“已撤销”，移除重命名/撤销操作。
- API 幂等处理重复 revoke；Web 不提供 enable、restore、delete。
- 失败保留 Modal 和目标上下文，不乐观显示 revoked。

## Android TV Session States

```text
Unregistered
  └─ user starts ─> Authorizing(code, expiresAt, interval)
       ├─ pending/slow_down ─> Authorizing
       ├─ denied/expired/Back ─> Unregistered
       └─ approved/token issued ─> RegisteredBackground

RegisteredBackground ──ON_START──> Heartbeating
Heartbeating ──success──> HealthyForeground ──60s──> Heartbeating
Heartbeating ──temporary failure──> Backoff ──timer/network──> Heartbeating
any foreground state ──ON_STOP──> RegisteredBackground
any registered state ──revoked/invalid_grant/repeated 401/403──> RequiresAuthorization
RequiresAuthorization ──user OK──> Authorizing
```

状态属于 domain `ClientSessionState`，不得从播放器 `catalogError` 猜测。

## Android TV Authorization Screen

### Visual hierarchy

1. Title `连接到 MAGI`
2. 简短说明：在手机或电脑打开 verification URI
3. 大号 user code（不得显示 device_code）
4. verification URI 文本
5. 可选 QR（辅助，不是唯一完成方式）
6. 状态/倒计时
7. Actions: `获取新代码`（过期时）、`取消`

### Focus map

| State                          | Initial focus                             | Up/Down                 | Left/Right   | OK                     |
| ------------------------------ | ----------------------------------------- | ----------------------- | ------------ | ---------------------- |
| Fresh code                     | `取消`；若有可复制/刷新操作则按视觉首操作 | 按视觉顺序移动          | 同操作组移动 | 执行焦点操作           |
| Expired                        | `获取新代码`                              | 在获取新代码/取消间移动 | 同组移动     | 申请新 challenge       |
| Temporary offline              | `重试`                                    | 重试/取消               | 同组移动     | single-flight 重试     |
| Requires authorization overlay | `重新授权`                                | 重新授权/稍后           | 同组移动     | 进入授权或关闭到安全页 |

- 短码/URI 是可读内容，不要求聚焦即可理解。
- 焦点状态使用轮廓 + 缩放/明度之一，不只使用颜色。
- 每个目标 ≥48dp；正文 ≥16sp，辅助文字 ≥14sp；位于 TV safe area。

### Focus restoration

- 临时错误 Overlay 关闭后，恢复到原频道/播放器触发元素。
- 从授权页取消：若从首次启动进入，返回安全的未授权 landing；若从 revoked overlay 进入，
  返回未授权 landing，不恢复受保护播放焦点。
- 完成授权后，进入播放器前显式聚焦当前频道/主播放 surface。

### Back hierarchy

```text
最上层错误/授权提示
→ 授权页
→ 信息层/侧栏
→ 上一安全页面
→ 退出应用
```

Back 不得绕过 `RequiresAuthorization` 进入受保护内容。取消授权不撤销 Web 已批准但尚未消费
的 grant；它自然过期，TV 清除本地 device_code。

## Android TV Error and Recovery Matrix

| Condition                      | Credential action    | Heartbeat action             | UI action                   |
| ------------------------------ | -------------------- | ---------------------------- | --------------------------- |
| No network                     | keep                 | pause until connectivity     | 离线提示，可手动重试        |
| Timeout/5xx                    | keep                 | full-jitter backoff          | 非阻塞临时错误              |
| 429                            | keep                 | honor Retry-After + jitter   | 显示稍后重试                |
| First 401                      | keep pending refresh | refresh once and replay once | 不立即打断播放              |
| Refresh success                | atomically rotate    | resume                       | 清临时 auth error           |
| invalid_grant/replay           | clear all            | stop                         | RequiresAuthorization       |
| device revoked                 | clear all            | stop permanently             | `设备访问已撤销` + 重新授权 |
| Replayed request still 401/403 | clear all            | stop                         | RequiresAuthorization       |
| Grant denied/expired           | no credential        | stop                         | 显示原因，允许获取新代码    |

## Playback Isolation Contract

- Heartbeat coordinator、ClientSessionRepository、TokenManager 不引用
  `Media3PlaybackSession`。
- Channel switch、buffer、first-frame、line failover 不触发注册或额外 heartbeat。
- 快速连续换台期间 `deviceClientId` 不变，心跳数量不随换台次数增加。
- Authorization terminal state 由 TvApp 顶层 gate 受保护内容；播放器释放/保留策略仍由现有
  单一 owner 决定，不由 heartbeat coordinator 操作。

## Accessibility and Security Assertions

- Web 状态有文字；所有 icon-only actions 有 aria-label；Modal label/error 可读且焦点可恢复。
- TV 全流程只用 D-pad、OK、Back；QR 不构成必要输入。
- Web/TV UI、semantics tree、截图、日志、诊断不包含 Access/Refresh Token、device_code、
  完整 verification_uri_complete、Client Secret、完整 IP 或播放地址。
- user_code 仅在短期授权页面显示，批准/过期后不进入客户端列表或审计详情。
