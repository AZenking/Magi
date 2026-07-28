# Specification Quality Checklist: UI Polish — 全局重置与页面间距修复

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — 仅在宪法治理约束（v2.2.0 design.md token）层面引用字号/字重/色值作为**验收标准**，不写 CSS 文件结构、组件签名、import 路径
- [x] Focused on user value and business needs — 4 个 user story 均围绕"管理员看到/做到什么"（间距不重叠、下拉能选、字号一致），不是技术切片
- [x] Written for non-technical stakeholders — 用业务语言描述（"标题栏与筛选行之间有间距"、"点击下拉看到选项"），不依赖技术名词
- [x] All mandatory sections completed — User Scenarios / Requirements / Success Criteria / Assumptions 均已填写

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — 全部决策有合理默认（reset 方案用轻量 CSS；间距用 flex gap；Select 修复用同步收集）
- [x] Requirements are testable and unambiguous — FR-001~011 均有可观察行为或可机器化检查（DevTools computed style / gap 测量 / options 计数）
- [x] Success criteria are measurable — SC-001 有 12 URL × 2 属性 = 24 检查点；SC-002 有 6 页面 × 3 gap = 18 检查点；SC-003 有 ≥9 个 Select 验证
- [x] Success criteria are technology-agnostic — SC 提到 DevTools / antd lint 作为**验证手段**而非功能要求，符合"可验证"原则
- [x] All acceptance scenarios are defined — 每个 user story 含 3-5 条 Given/When/Then
- [x] Edge cases are identified — 4 条 edge case 覆盖 antd 不受影响 / SSR 兼容 / 异步 options / 移动端
- [x] Scope is clearly bounded — Assumptions 明确排除暗黑模式/i18n/api/worker/tv/docker/数据库/业务逻辑
- [x] Dependencies and assumptions identified — 7 条假设覆盖前置依赖、reset 方案、间距方案、Select 修复方案、暗黑模式、i18n、scope

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria — FR-001~011 均映射到 US1-US4 的 Acceptance Scenario
- [x] User scenarios cover primary flows — 全局基线 / 列表间距 / Select 下拉 / 登录居中 4 条主线
- [x] Feature meets measurable outcomes defined in Success Criteria — 每个 SC 都可独立验证
- [x] No implementation details leak into specification — spec.md 未出现具体 CSS 选择器、React 组件代码、import 路径写法

## Notes

- 本 spec **不触发 [NEEDS CLARIFICATION]**：所有问题在 002 收尾阶段已明确（reset 缺失是 002 PR7 的遗漏，修复方案有合理默认）。
- **scope 小**：4 个 user story 均为"修复回归缺陷"，非新功能。预估 1 个 PR 即可完成（全局 reset + 间距 + Select 修复 + 登录页），总工时 4-6 小时。
- **关键风险**：Select 兼容层的 options 注册机制重构可能影响所有用 Select 的页面（频道/任务/源/节目/EPG 匹配），需回归测试 ≥ 9 个 Select 实例。
- **依赖前置**：002-ui-full-antd-migration 必须已合并（提供全 antd 栈基线）。当前 002 实现已完成（仅待浏览器手测后合并）。
- **下一步**：直接 `/speckit-plan`（plan 阶段决定 reset 注入方式：CSS 文件 vs ConfigProvider theme.cssVar vs antd App 组件）；不需要 `/speckit-clarify`。
