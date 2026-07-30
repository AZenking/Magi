# Feature Specification: Magi TV V0.1 — Android TV 技术验证版

**Feature Branch**: `006-magi-tv-v0.1`

**Created**: 2026-07-29

**Status**: Draft

**Input**: 路线图 §7.1 V0.1(`docs/magi-tv-product-roadmap.md`)。依赖 spec 005 开放接口 + 新增 playback 端点。

## 范围与边界

V0.1 是**内部技术验证版**:证明真实 Android TV 能通过 Magi 开放接口接入并拿到播放数据。**不追求**完整产品体验。

**做(本 V0.1 地基)**:
- 配置接入(手填 Server + API key)
- 拉取分组 + 频道列表
- 取得频道播放决策(最佳线路 + 备用)
- 工程可编译、遥控器可导航

**暂不(留 V0.1 后期真机迭代 / V0.3)**:
- ExoPlayer 全屏播放 / HLS-MPEG-TS 解码调试(需真机)
- 正式配对(二维码/六位码)
- 收藏 / 最近观看 / 完整首页
- 完整 EPG 时间轴 UI
- 自动换线协议接入健康度
- 商店发布准备

## User Scenarios & Testing

### User Story 1 - 首次配置接入 (Priority: P1)

用户在 Android TV 上启动 Magi TV,因为没有配置,看到配置页:输入 Magi Server 地址 + API key(在后台「开放接口 · API Keys」签发)。保存后进入频道页。

**Why this priority**: 整个客户端的前提 —— 接不上 Server,什么都不能做。复用 spec 005 的开放接口 API key 作为"临时设备令牌"(路线图 §7.1)。

**Acceptance Scenarios**:
1. **Given** 首次启动(无配置),**When** 应用启动,**Then** 显示配置页。
2. **Given** 配置页,**When** 用户输入 Server 地址 + API key 并确认,**Then** 配置持久化,应用进入频道页。
3. **Given** 已保存配置,**When** 重启应用,**Then** 直接进入频道页(不重复配置)。

### User Story 2 - 浏览频道列表 (Priority: P1)

已配置的 TV 显示频道分组和频道列表,用户可用遥控器按分组过滤、浏览频道。

**Why this priority**: 频道是 IPTV 客户端的核心数据,与 US1 并列 P1。验证开放接口 `/api/open/v1/groups` + `/channels` 在 TV 端可用。

**Acceptance Scenarios**:
1. **Given** 已配置,**When** 进入频道页,**Then** 显示分组过滤行 + 频道列表。
2. **Given** 频道页,**When** 选择某分组,**Then** 列表只显示该分组频道。
3. **Given** 频道页,**When** 用方向键浏览,**Then** 焦点可在分组与频道间移动,无死区。

### User Story 3 - 取得播放决策 (Priority: P2)

选中某频道后,TV 调 `/api/open/v1/channels/{id}/playback` 拿到播放决策(最佳线路 + 备用顺序),展示出来。V0.1 地基只验证"能拿到正确的播放地址",不全屏播放。

**Why this priority**: 播放是 IPTV 的目的,但全屏播放需真机调试(本机无连接设备)。先把"拿到地址"验证,播放器集成留真机迭代。

**Acceptance Scenarios**:
1. **Given** 频道页,**When** 选中某频道并确认,**Then** 调 playback 接口,显示主线路 URL 与备用线路数。
2. **Given** 频道无可用线路,**When** 选中它,**Then** 显示"无可用线路"(playable:false)。
3. **Given** API key 无效,**When** 尝试拉数据,**Then** 显示未授权错误。

### User Story 4 - 工程可编译可部署 (Priority: P1)

`apps/tv` Gradle 工程能 `./gradlew :app:assembleDebug` 产出可安装的 APK,不依赖真机即可验证构建链完整。

**Why this priority**: 这是后续所有真机迭代的基础,也是 V0.1 "内部技术验证"的硬门槛。

**Acceptance Scenarios**:
1. **Given** apps/tv 工程,**When** 运行 assembleDebug,**Then** 产出 app-debug.apk 且构建成功。
2. **Given** 产出的 APK,**When** 安装到 Android TV 设备(emulator 或真机),**Then** 出现在 TV 启动器,可启动。

## Requirements

### Functional Requirements

- **FR-001**: 应用 MUST 在首次启动(无配置)时显示配置页,输入 Magi Server 地址与 API key。
- **FR-002**: 应用 MUST 将配置持久化到设备(DataStore),重启后不重复配置。
- **FR-003**: 应用 MUST 通过 `GET /api/open/v1/groups` 拉取频道分组,显示分组过滤行。
- **FR-004**: 应用 MUST 通过 `GET /api/open/v1/channels`(可选 group 过滤)拉取频道列表。
- **FR-005**: 频道列表 MUST 显示频道名、分组;每条频道用方向键可达、可确认。
- **FR-006**: 选中频道并确认时,应用 MUST 通过 `GET /api/open/v1/channels/{id}/playback` 取得播放决策。
- **FR-007**: 应用 MUST 展示播放决策(可播放性、主线路、备用线路数);无可播放线路时显示明确状态。
- **FR-008**: 所有开放接口请求 MUST 携带 `Authorization: Bearer <apiKey>`。
- **FR-009**: 接口错误(未授权/网络失败)MUST 在界面上显示明确错误,而非静默失败。
- **FR-010**: 应用 MUST 以 Android TV(Leanback)模式声明,出现在 TV 启动器。
- **FR-011**: 应用 MUST 可用遥控器(方向键 + OK + 返回)完成全部操作,不依赖触摸。

### 非功能(技术验证门槛,路线图 §7.1)

- **NF-001**: `./gradlew :app:assembleDebug` 构建成功(JDK 17–21)。
- **NF-002**: APK 可安装到 Android TV 设备且可启动(留真机验证)。

## 依赖

- **spec 005 开放接口**:`/api/open/v1/groups`、`/channels`、`/channels/{id}` 已就绪。
- **新增 playback 端点**:`/api/open/v1/channels/{id}/playback`(本 V0.1 配套新增,已实现)。
- **API key**:后台「开放接口 · API Keys」页签发(spec 005 US1 已就绪)。

## Success Criteria

- **SC-001**: 已配置的 TV 能在 3 秒内显示分组与频道列表(网络正常时)。
- **SC-002**: 选中任意对外可见频道,能取得播放决策(可播放频道拿到主线路 URL)。
- **SC-003**: 全部操作仅用遥控器完成,无焦点死区。
- **SC-004**: APK 构建可重复(`assembleDebug` 稳定成功)。

## Assumptions

- 复用 spec 005 开放接口的 API key 模型,不在 TV 端做正式配对。
- 默认直连上游(路线图 §10.1):TV 拿到 playback 返回的真实线路 URL 直连,不经 Magi 代理。
- 播放决策有效期 5 分钟(playback 端点 `decisionExpiresAt`),过期重取。
- 本 V0.1 地基不含 ExoPlayer 全屏播放;播放器集成是连接真机后的独立迭代。
- Android 工程(`apps/tv`)是 Gradle 体系,**不进** pnpm/turbo(异构生态),用 `JAVA_HOME` 选 JDK(推荐 17–21,本机用 JBR 21)。
- compileSdk 35, minSdk 23(tv-foundation 要求), targetSdk 35;目标设备 Android TV 9+(API 28)。
