# 群晖 Container Manager 部署

本指南使用 GitHub Actions 发布的 MAGI 镜像部署到 DSM 7.2+ 的
Container Manager。镜像同时提供 `linux/amd64` 与 `linux/arm64`，Intel 和
ARM 群晖均可直接拉取正确架构。

## 1. 准备项目目录和配置

通过 SSH 登录有 Container Manager 权限的 DSM 管理员账号后，创建项目目录：

```bash
mkdir -p /volume1/docker/magi
cd /volume1/docker/magi

curl -fsSLo compose.yaml \
  https://raw.githubusercontent.com/AZenking/magi/master/docker/docker-compose.server.yml
curl -fsSLo .env \
  https://raw.githubusercontent.com/AZenking/magi/master/docker/.env.prod.example
chmod 600 .env
```

Container Manager 项目会自动读取与 `compose.yaml` 同目录的 `.env`。
它**不会**自动读取 `.env.prod`；缺少 `.env` 时会出现
`POSTGRES_USER is required` 或 `POSTGRES_DB is required`。

编辑 `/volume1/docker/magi/.env`。密码和认证密钥使用不同的随机十六进制值：

```bash
for key in POSTGRES_PASSWORD REDIS_PASSWORD BETTER_AUTH_SECRET; do
  printf '%s=' "$key"
  openssl rand -hex 32
done
```

最少需要如下配置（示例域名必须替换为自己的域名）：

```ini
POSTGRES_USER=magi
POSTGRES_PASSWORD=<随机值>
POSTGRES_DB=magi
REDIS_PASSWORD=<另一随机值>

IMAGE_PREFIX=ghcr.io/azenking
# 发布版本提交会产生与根 package.json 相同的镜像标签，例如 0.2.0。
# 首次部署或版本标签尚未发布时使用 latest；生产环境建议改为具体版本。
IMAGE_TAG=latest

WEB_PORT=18080
API_PORT=18081
WEB_ORIGIN=https://magi.example.com
BETTER_AUTH_SECRET=<随机值>
BETTER_AUTH_URL=https://api-magi.example.com
PUBLIC_API_HOST=api-magi.example.com
VITE_API_URL=https://api-magi.example.com

MAGI_ADMIN_USERNAME=admin
MAGI_ADMIN_PASSWORD=<强密码>
MAGI_ADMIN_EMAIL=admin@example.com
MAGI_ADMIN_NAME=Admin
```

`POSTGRES_USER` 和 `POSTGRES_DB` 不能省略。不要使用 `export KEY=value`，
也不要在等号两侧添加空格。

## 2. 首次启动与管理员初始化

首次部署需要运行一次 `seed` 服务来创建管理员：

```bash
cd /volume1/docker/magi
docker compose -f compose.yaml --profile setup up -d
docker compose -f compose.yaml --profile setup logs --tail=100 seed
docker compose -f compose.yaml ps
```

`seed` 的成功状态为 `Exited (0)`，日志会包含以下之一：

```text
Admin user "admin" created successfully.
Admin user "admin" synchronized successfully.
```

日常更新不需要启用该 profile：更新 `.env` 的 `IMAGE_TAG` 后执行：

```bash
docker compose -f compose.yaml pull
docker compose -f compose.yaml up -d
docker compose -f compose.yaml ps
```

`seed` 会同步同名管理员的资料和密码。因此不要在每次 API 容器启动时无条件运行它；
仅在首次初始化或明确需要重置 `.env` 中管理员密码时运行。

## 版本发布流程

根目录 `package.json` 的 `version` 是容器发布版本的唯一来源。发布新版本时：

1. 先修改根目录 `package.json`，例如将 `0.1.0` 改为 `0.2.0`。
2. 将版本修改与本次代码一起提交并推送到 `master`。
3. GitHub Actions 读取该版本，构建四个镜像并发布 `0.2.0`、`latest` 和
   `sha-<commit>` 标签，同时将版本写入 OCI 镜像标签。
4. Actions 成功后，在群晖 `.env` 设置 `IMAGE_TAG=0.2.0`，执行上面的更新命令。

未修改版本号的普通修复提交不会覆盖旧版本标签，只会更新 `latest` 和 SHA 标签。

## 3. Cloudflare Tunnel

Tunnel 负责公网 HTTPS 到群晖内网 HTTP 的转发；不需要在路由器开放
`WEB_PORT` 或 `API_PORT`。

在 Cloudflare Zero Trust 的 Tunnel 中创建两个 `HTTP` Published application：

| Public hostname | Service URL（cloudflared 运行在群晖主机上） |
| --- | --- |
| `magi.example.com` | `http://127.0.0.1:18080` |
| `api-magi.example.com` | `http://127.0.0.1:18081` |

如果 `cloudflared` 是独立容器，`127.0.0.1` 指向它自身；改为群晖内网 IP，
或让它加入同一 Docker 网络后使用服务名。

建议 API 使用 `api-magi.example.com`，不要使用
`api.magi.example.com`。后者是两级子域名，Cloudflare Universal SSL 默认
不会覆盖，可能导致 `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`。Tunnel 创建路由时
会自动建立指向 `<Tunnel-ID>.cfargotunnel.com` 的 DNS 记录；不要保留同名
旧 A/AAAA 记录，也不要将记录设为 `DNS only`。

在 Cloudflare 的 `SSL/TLS → Overview` 中，模式不能为 `Off`；在
`Edge Certificates` 中确认 Universal SSL 为 `Active`。`GET /api/auth/get-session`
在未登录时可以返回空会话，但必须先返回正常 HTTP 状态，而不是 TLS 错误。

不要对 API 域名启用 Cloudflare Access：Android TV 和传统 M3U 播放器不能
完成浏览器 SSO。MAGI 的开放 API 和播放列表使用自身的 API Key / grant 鉴权。

## 4. GHCR 拉取失败

目前的 `magi-api`、`magi-web`、`magi-worker`、`magi-migrate` 包均为公开包，
因此 `ghcr.io/v2: EOF` 不是登录或包权限问题。

在群晖验证：

```bash
curl -4 -sS -D- -o /dev/null --connect-timeout 15 https://ghcr.io/v2/
```

出现 `401 Unauthorized` 表示 GHCR 网络正常；`EOF` 或
`SSL_ERROR_SYSCALL` 表示群晖到 GHCR 的 HTTPS 握手被网络中断。Docker Hub
镜像加速器不会代理 `ghcr.io`。应在网关/路由器中为群晖的内网 IP 配置出站代理
或策略路由（覆盖 `ghcr.io`、`github.com` 与 GitHub CDN）；Cloudflare Tunnel
只处理入站访问，不能修复此问题。

## 5. 避免重复 Compose 栈

不要在不同目录或用不同项目名重复启动同一套 Compose 文件，否则会创建例如
`magi-*` 与 `magee-*` 两套容器。后一套可能占用同一端口，前一套 API/Web 会显示
`Created` 而无法启动；并且两个 PostgreSQL 数据卷互不共享，导致在错误栈中运行
`seed` 后，正在访问的 API 仍然显示 `User not found`。

排查端口与当前运行栈：

```bash
docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}'
docker inspect <正在运行的API容器> --format \
'目录={{ index .Config.Labels "com.docker.compose.project.working_dir" }}\n配置={{ index .Config.Labels "com.docker.compose.project.config_files" }}'
```

始终进入该 API 对应的工作目录、使用相同的 Compose 项目运行 `seed`。先确认
端口占用者和数据库归属，再停止旧容器；不要为了释放端口直接删除未知容器。

## 6. 验收与安全

```bash
docker compose -f compose.yaml ps
docker compose -f compose.yaml logs --tail=100 migrate api worker
```

确认 PostgreSQL、Redis 为 healthy，迁移和 seed 成功退出，API、Worker、Web 为
`Up`。数据库与 Redis 的 healthy 并不代表 API 已可用，仍需通过公网域名完成
登录验证。

不要将 `.env`、管理员密码、GitHub PAT 或其他密钥提交到仓库或粘贴到工单/聊天。
若密钥已泄露，应立即生成新值、更新 `.env`，并重新运行 seed（管理员密码）或
重新部署（服务认证密钥）。
