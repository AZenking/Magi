# Quickstart: 开放接口平台 — 频道与节目单只读 API

**Branch**: `005-open-channels-epg-api` | **Date**: 2026-07-29

> 本文件是**端到端验证指南**,证明特性已跑通。不含完整实现(见 tasks.md)。
> 契约细节见 [contracts/open-api.md](./contracts/open-api.md) 与 [contracts/admin-api-keys.md](./contracts/admin-api-keys.md);数据模型见 [data-model.md](./data-model.md)。

---

## 前置条件

1. 本地基础设施已起(`bash scripts/init-dev.sh`):PostgreSQL + Redis 运行,迁移已执行,admin 账号已创建。
2. 至少存在一个**对外可见**的 canonical channel(即 `lifecycle=active` 且未隐藏/停用),并有至少一条已绑定 EPG 的节目。可借现有后台导入一个 M3U/XMLTV 源快速达成。
3. API 服务在 `:3001`,Web 在 `:3000`。

---

## 场景 1:签发 key 并读取频道列表(US1 + US2)

**步骤 1 — 登录后台,签发 key**

用 admin 账号登录 `http://localhost:3000`,进入「开放接口 / API Keys」页,点「新建」,填名称 `测试-key`,提交。

期望:弹窗一次性显示明文 `magi_<32>`,带「复制」按钮;列表出现该 key,`keyPrefix` 形如 `magi_3f9…`,状态 `启用`。刷新页面后**不再显示明文**。

> 等价命令行(管理 API,需 admin session cookie):
> ```bash
> # 先通过 /api/auth/sign-in 拿到 cookie 到 cookies.txt
> curl -b cookies.txt -X POST http://localhost:3001/api/admin/api-keys \
>   -H 'content-type: application/json' \
>   -d '{"name":"测试-key"}'
> # 响应 data.key 即明文,仅此一次
> ```

**步骤 2 — 用 key 读频道列表**

```bash
KEY="magi_<32>"   # 上一步拿到的明文
curl -s "http://localhost:3001/api/open/v1/channels?pageSize=5" \
  -H "Authorization: Bearer $KEY"
```

**期望(通过)**:
- HTTP 200,`success: true`。
- `data.items[]` 每项含 `id`(形如 `magi:...`)、`name`、`group`、`logo`、`channelNumber`。
- **字段中绝不出现** `streamUrl`、`sourceId`、`healthStatus`、`lifecycle`(FR-012)。
- 已隐藏/停用/回收的频道不出现(FR-011)。

**步骤 3 — 隔离验证(关键)**

```bash
# (a) 后台 cookie 不应能访问开放接口(把 admin cookie 当 key 用)
curl -i -b cookies.txt http://localhost:3001/api/open/v1/channels
# 期望:401 api-key-required/invalid(FR-019)

# (b) API key 不应能访问管理接口
curl -i -X GET http://localhost:3001/api/admin/api-keys -H "Authorization: Bearer $KEY"
# 期望:401 authentication-required(FR-019 反向)
```

---

## 场景 2:节目单读取(US3)

```bash
FROM=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)   # macOS;Linux 用 -d
TO=$(date -u -v+6H +%Y-%m-%dT%H:%M:%SZ)
curl -s "http://localhost:3001/api/open/v1/epg?from=$FROM&to=$TO&pageSize=5" \
  -H "Authorization: Bearer $KEY"
```

**期望**:200,`items[]` 含 `channelId`(magi: 前缀)、`title`、`startAt`/`stopAt`(ISO 8601);不可见频道的节目不出现。

**超窗拒绝验证**:
```bash
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3001/api/open/v1/epg?from=$FROM&to=$(date -u -v+8d +%Y-%m-%dT%H:%M:%SZ)" \
  -H "Authorization: Bearer $KEY"
# 期望:400 validation-failed(FR-014)
```

---

## 场景 3:禁用/吊销即时生效(US5)

```bash
# 取 key 的 uuid(从管理列表)
ID="<api-key-uuid>"

# 禁用
curl -b cookies.txt -X POST http://localhost:3001/api/admin/api-keys/$ID/disable
# 紧接着用 key 调开放接口
curl -i http://localhost:3001/api/open/v1/groups -H "Authorization: Bearer $KEY"
# 期望:401 api-key-invalid(下次请求即失效,US5-AC1)

# 启用后恢复
curl -b cookies.txt -X POST http://localhost:3001/api/admin/api-keys/$ID/enable
curl -i http://localhost:3001/api/open/v1/groups -H "Authorization: Bearer $KEY"
# 期望:200

# 吊销(不可逆)
curl -b cookies.txt -X POST http://localhost:3001/api/admin/api-keys/$ID/revoke
curl -i http://localhost:3001/api/open/v1/groups -H "Authorization: Bearer $KEY"
# 期望:401(且 enable 无法恢复 → 409 invalid-state-transition)
```

---

## 场景 4:OpenAPI 契约自助接入(US4)

```bash
# 交互文档
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/docs
# 期望:200(Swagger UI HTML)

# 机器可读规范
curl -s http://localhost:3001/api/open.json | jq '.paths | keys'
# 期望:列出 /api/open/v1/groups、/channels、/channels/{id}、/epg

# 规范可被标准工具解析校验
curl -s http://localhost:3001/api/open.json | npx @redocly/cli@latest lint -
# 期望:无 error
```

---

## 场景 5:限流(US5 / FR-020)

```bash
# 快速发 70 次请求(超 60/min 阈值)
for i in $(seq 1 70); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/open/v1/groups -H "Authorization: Bearer $KEY"
done | sort | uniq -c
# 期望:前若干 200,之后出现 429 rate-limit-exceeded
```

---

## 验收汇总

| SC | 验证方式 | 通过标准 |
|---|---|---|
| SC-001 | 场景1 步骤1+2 | 1 分钟内签发 key 并成功读频道 |
| SC-002 | 场景1 步骤2 字段审查 | 响应零运维字段泄露 |
| SC-003 | 场景3 | 禁用/吊销下次请求即失效 |
| SC-004 | 场景4 | 仅凭 docs + open.json 可接入 |
| SC-005 | 场景5 | 单 key 超限不影响其他 key |
| SC-006 | 场景1 步骤3 | 双向凭据隔离零穿透 |

---

## 质量门槛(合并前)

```bash
pnpm lint
pnpm build
# 每个 package 的 tsc --noEmit
```

均须通过(宪法"开发流程与质量门槛")。
