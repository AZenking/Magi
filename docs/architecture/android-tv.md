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
    ├── settings/       # 配置 Screen / UiState / ViewModel
    └── channels/       # 频道、EPG、诊断、播放器 UI
```

## 当前业务链路

### 启动与配置

1. `MagiTvApp` 创建唯一 `AppContainer`。
2. `TvApp` 生命周期感知地观察 `ConnectionSettingsRepository.settings`。
3. 未配置时，`SetupViewModel` 接收 `SetupAction`，调用
   `SaveConnectionSettingsUseCase` 完成 URL 校验、规范化和 DataStore 保存。
4. 设置流更新后，根 UI 自动进入频道功能，不由配置页直接导航。

### 频道目录

1. `ChannelListViewModel` 初始化时触发 `GetChannelCatalogUseCase`。
2. 用例通过 `TvContentRepository` 获取频道分组和频道。
3. `DefaultTvContentRepository` 调用远端数据源并将 DTO 映射为领域模型。
4. ViewModel 只输出单一 `ChannelListUiState`。
5. 分组选择、重试和播放均以 `ChannelListAction` 从 UI 向上发送。

### EPG

1. `TvNavigationViewModel` 保存当前 UI 目的地。
2. 进入节目单时，独立 `EpgViewModel` 调用 `GetProgrammeGuideUseCase`。
3. 用例统一定义“当前时间起 12 小时”的产品时间窗。
4. Repository 负责把时间转换成远端 API 所需的 UTC ISO 格式。
5. `EpgScreen` 只消费 `EpgUiState`、频道领域模型和焦点事件。

### 播放

1. 频道播放动作调用 `ResolvePlaybackUseCase`。
2. 用例规范化 `magi:` 频道 ID，并确保决策至少包含一条可用线路。
3. 根 UI 收到 `PlaybackRequestState.Ready` 后创建屏幕级
   `Media3PlaybackSession`。
4. 播放会话按主线路、备用线路顺序尝试，Media3 错误由平台 Mapper 转为
   领域错误分类。
5. 离开播放器时 `DisposableEffect` 立即释放 ExoPlayer，不依赖
   Activity 级 ViewModel 清理。

### 诊断

1. `Media3PlaybackSession` 只向 `DiagnosticsRepository` 写入脱敏错误事件和
   首帧耗时。
2. `DiagnosticsViewModel` 合并两条数据流并输出 `DiagnosticsUiState`。
3. 诊断 UI 不直接访问全局单例，也不接触播放 URL 或 API Key。

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
