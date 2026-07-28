# Specification Quality Checklist: 全量切换所有 UI 到 antd

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — 仅在宪法治理约束（v2.0.0/v2.1.0/v2.2.0）层面引用 antd / shadcn / Tailwind 关键字；不写代码结构、组件签名、import 路径
- [x] Focused on user value and business needs — 5 个 user story 均围绕"管理员在 MAGI 内看到/做到什么"，不是技术切片
- [x] Written for non-technical stakeholders — 用业务语言描述（"侧边栏切换模块"、"添加源"），不依赖技术名词
- [x] All mandatory sections completed — User Scenarios / Requirements / Success Criteria / Assumptions 均已填写

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — 全部决策有合理默认（packages/ui 去留 → plan 阶段定；图表策略 → plan 阶段定；其他默认明确）
- [x] Requirements are testable and unambiguous — FR-001 至 FR-013 均有可观察行为或可机器化检查（grep / antd lint / 断点测试）
- [x] Success criteria are measurable — SC-001/002 有具体计数（0 命中、0 包）；SC-003 有 36 组合 ≥34 通过；SC-004 0 violation；SC-005 步骤数对比；SC-006 5 人 ≥4；SC-007 净减 ≥2000 行
- [x] Success criteria are technology-agnostic — SC-001/002/004 提到具体工具（grep / antd lint）作为**验证手段**而非**功能要求**，符合"可验证"原则
- [x] All acceptance scenarios are defined — 每个 user story 含 4-5 条 Given/When/Then
- [x] Edge cases are identified — 7 条 edge case 覆盖混合栈期间、第三方依赖、URL 兼容、移动端、i18n、暗黑模式、测试策略
- [x] Scope is clearly bounded — Assumptions 明确排除 apps/api / apps/worker / apps/tv / docker / 数据库 / 业务逻辑 / 暗黑模式 / i18n / 测试框架
- [x] Dependencies and assumptions identified — 13 条假设覆盖前置依赖（001）、PR 策略、packages/ui 去留、图表策略、图标库、i18n、暗黑模式、测试、浏览器、路由、API 契约、执行节奏

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria — FR-001~013 均映射到至少一个 User Story 的 Acceptance Scenario
- [x] User scenarios cover primary flows — 根布局 / 导航 / 表单 / 浏览 / 清理 5 条主线
- [x] Feature meets measurable outcomes defined in Success Criteria — 每个 SC 都可独立验证
- [x] No implementation details leak into specification — spec.md 未出现 TanStack Router 配置代码、antd 组件的具体 props 写法（仅在 acceptance scenario 引用 antd 组件名作为对照物，符合"用业务语言说明视觉标准"的合理引用）

## Notes

- 本 spec **不触发 [NEEDS CLARIFICATION]**：用户输入"全面调整所有的UI；将其全量切换到antd"语义清晰（全量、无残留），宪法 v2.0.0/v2.1.0/v2.2.0 已锁定技术栈与流程，无歧义空间。
- **大 scope 警告**：本特性是 001 的 5-10 倍工作量（38 组件 + 10 路由 + features 模块 + 全局资源），建议分 6 个 PR 按 user story 推进，每个 PR 独立 review/部署/回滚。
- **关键决策点**（留待 plan 阶段定）：
  1. packages/ui 去留（删除 vs 保留为 antd 包装层）
  2. 图表组件策略（@ant-design/charts vs 保留 recharts）
  3. 每个 user story 的 PR 切分粒度（是否进一步细分）
  4. 混合栈期间的 Tailwind preflight 与 antd 共存策略（001 已验证局部可行，全局需复核）
- **依赖前置**：001-redesign-login-ui 必须已合并（提供 ConfigProvider 局部包裹、useToken、错误分类等模式 + contracts/antd-api.md 速查）。当前 001 已完成 implementation 阶段，等待浏览器手测后合并。
- **下一步建议**：先跑 `/speckit-plan`（plan 阶段会决定上述 4 个关键决策点 + 拆解每个 user story 的 task）；不要直接 `/speckit-implement`（spec scope 太大，必须先 plan）。
