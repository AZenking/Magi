# Android TV 分层架构

## 目标

Android TV 客户端采用 Android 官方推荐的 UI、Domain（按需）和 Data 分层，并保持单向数据流：

```text
遥控器事件
    ↓
Screen → Action → Feature ViewModel → Use Case → Repository → Data Source
    ↑                         ↓
    └──────── immutable UiState / domain model ────────┘
```

依赖只能朝业务内层移动：

```text
ui ───────────────→ domain ←────────────── data
 │                     ↑                    │
 └→ playback adapter ──┘        remote / DataStore implementations

Application → AppContainer → repositories + use cases
```

## 目录职责

```text
com.magi.tv
├── domain/
│   ├── model/          # 无 Android、Retrofit、Media3 依赖的业务模型
│   ├── repository/     # 数据与诊断端口
│   └── usecase/        # 跨页面或含业务规则的单一职责用例
├── data/
│   ├── remote/         # Retrofit API、网络 DTO、远端数据源
│   └── repository/     # DTO 映射、DataStore、内存诊断实现
├── playback/           # Media3 平台适配与屏幕级播放会话
├── di/                 # 小型应用的手动依赖注入容器
└── ui/
    ├── navigation/     # UI 导航状态
    ├── client/         # 设备自动登记与恢复 UI
    └── channels/       # 频道、EPG、诊断、播放器 UI
```

## 当前业务链路

### 启动与设备登记

1. `MagiTvApp` 创建唯一 `AppContainer`。
2. `AppContainer` 创建 `KeystoreClientCredentialStore`、`TokenManager`、
   `DefaultClientSessionRepository` 和应用级 `ClientHeartbeatCoordinator`。
3. `MagiTvApp` 将心跳协调器绑定到 `ProcessLifecycleOwner`；心跳独立于
   Media3 播放器生命周期。
4. `TvApp` 读取加密设备凭据。没有凭据时显示
   `ClientAuthorizationScreen`，由 `ClientAuthorizationViewModel` 调用
   `/api/open/v1/auth/device-register` 自动登记到默认账户。
5. 登记成功后只持久化轮换 `refresh_token` 的加密元数据，根 UI 进入直播；
   凭据失效或用户选择“重新配置”时停止旧播放会话、清除凭据并重新登记。

### 设备令牌与心跳

1. `TokenManager` 只在内存缓存短期 Access Token，Refresh Token 保存在
   Android Keystore 加密的数据存储中，并以 Mutex 保证刷新单飞。
2. `ClientHeartbeatCoordinator` 在前台每 60 秒发送一次设备心跳，网络恢复或
   回到前台时立即唤醒；失败使用带随机扰动的有上限退避。
3. 服务端以接收时间判定在线状态（150 秒窗口）；TV 不提交本地时间作为权威。
4. 心跳返回内容修订号后，`CachedTvContentRepository` 在后台刷新频道/EPG
   快照；心跳不创建或持有播放器。
5. 心跳首次收到 401 时复用 `TokenManager` 的单飞刷新并只重试一次；刷新后的
   Token 仍被拒绝或轮换失败时清除本地凭据、释放播放器并进入一轮新的登记 UI。
6. 服务端撤销的客户端不会通过同一 `installation_id` 自动复活，需账户侧先
   解除撤销。

### 频道目录

1. `LivePlaybackViewModel` 初始化时触发 `GetChannelCatalogUseCase`。
2. 用例通过 `TvContentRepository` 获取频道分组和频道。
3. `DefaultTvContentRepository` 调用远端数据源并将 DTO 映射为领域模型。
4. ViewModel 输出单一 `LivePlaybackUiState`，并以缓存快照优先保证断网时的
   已知频道仍可展示。
5. 侧栏提供“全部 / 收藏 / 最近 / 分组”快捷入口；收藏与最近观看保存在本机
   `ChannelPreferencesStore`，不会更改后台频道编排或全量换台顺序。
6. 分组选择、重试和播放均由遥控器事件驱动；换台不重置设备身份或心跳。

### EPG

1. 直播页的 `ChannelEpgSideSheet` 是播放器内全屏覆盖层；打开后播放器根节点
   禁止参与焦点竞争，关闭后重新请求播放器焦点。
2. `LivePlaybackUiState.guideWindow` 使用不可变 `EpgTimeWindow`，以当前本地时间
   对齐到 30 分钟刻度，固定前后 2 小时；切换日期通过本地墙上时钟保持时间段。
3. `guidesByChannel` 为每个频道保存窗口键、节目、加载中、过期、错误和空节目状态。
   网格只把当前可见频道和前后邻居交给 `GetProgrammeGuideUseCase.batch`，避免单频道
   焦点抖动造成请求风暴。
4. Room/内容快照仍是缓存边界，单次请求不超过 4 小时；Repository 负责把本地窗口
   转为远端 API 所需的 UTC ISO 格式，不新增后端契约。
5. 网格用固定频道栏和统一时间轴渲染节目块；30 分钟边缘左右移动会平移窗口。
   日期和筛选项使用 `LazyRow`，节目和频道使用独立焦点描边，当前节目使用播放色。
6. 每行没有节目单时仍保留频道行；错误或过期只影响该行，不清空整个 EPG。
   第一阶段 OK 只负责播放所属频道，不进入详情、Catch-up、录制或提醒流程。

### 播放

1. 频道播放动作调用 `ResolvePlaybackUseCase`。
2. 用例规范化 `magi:` 频道 ID，并确保决策至少包含一条可用线路。
3. `LivePlaybackViewModel` 持有屏幕级 `Media3PlaybackSession`；
   `LivePlaybackScreen` 只负责渲染 `PlayerView`，不会在重组时重复创建播放器。
4. 播放会话按主线路、备用线路顺序尝试，Media3 错误由平台 Mapper 转为
   领域错误分类，并上报脱敏的播放结果。
5. 重新登记或 ViewModel 清理时显式释放 ExoPlayer；换台、缓冲和线路切换不
   创建新的设备客户端。

### 诊断

1. `Media3PlaybackSession` 只向 `DiagnosticsRepository` 写入脱敏错误事件和
   首帧耗时。
2. `DiagnosticsViewModel` 合并两条数据流并输出 `DiagnosticsUiState`。
3. 诊断 UI 不直接访问全局单例，也不接触播放 URL、API Key 或 Bearer Token。

## 分层边界

- Compose 不导入 Retrofit DTO。
- ViewModel 不创建 Retrofit、OkHttp 或 DataStore。
- Data 层不依赖 Compose 或 UI 状态。
- Domain 模型不依赖 Android SDK。
- Media3 类型只存在于 `playback` 适配层和播放器渲染边界。
- 每个页面拥有自己的 UiState；跨页面导航由独立导航状态持有者管理。
- Domain 层只承载复用或有规则的逻辑，简单数据转发不机械创建 Use Case。

## 验证

- 领域用例使用假 Repository 进行 JVM 单元测试。
- Debug APK 构建和 Android Lint 必须通过。
- 频道、EPG、诊断和播放状态需在 Android TV 模拟器回归。

## 依据

- Android Developers：Guide to app architecture
- Android Developers：UI layer 与 Unidirectional Data Flow
- Android Developers：Data layer 与 Repository / Source of Truth
- Android Developers：Domain layer（按复杂度和复用需求选择）
