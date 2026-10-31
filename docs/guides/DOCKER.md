# Docker 部署

## 原理与准备

Docker 镜像只提供静态网页。Node 24 Alpine 负责构建，运行阶段使用 `nginxinc/nginx-unprivileged:stable-alpine`，以非 root 方式监听 8080。Compose 将根文件系统设为只读，临时文件写入 tmpfs，移除 Linux capabilities。

用户记录位于访问者浏览器的 IndexedDB，**不是容器里的数据库文件**。不配置数据库容器、账号密钥或持久化数据卷。保留 LICENSE、第三方声明及界面来源标记。

需要先安装并启动 Docker Engine 或 Docker Desktop，并能执行 `docker compose version`。首次构建需要联网。

## 默认启动：仅本机访问

```sh
git clone https://github.com/Murphy-404/OneCup.git
cd OneCup
docker compose up -d --build
```

访问 **http://127.0.0.1:8080/**。默认宿主机端口仅绑定 `127.0.0.1`，适合本机使用，或由宿主机上的 HTTPS 反向代理转发。

```sh
docker compose ps
docker compose logs -f
```

健康检查使用 `/healthz`。可访问 `http://127.0.0.1:8080/healthz`，正常应返回 `ok`。程序本身没有 `/api/health`、登录或数据 API。

## 修改端口 / 开放网络接口

在项目根目录建立本地 `.env`（不提交 Git），例如：

```dotenv
ONECUP_BIND=0.0.0.0
ONECUP_PORT=18080
```

再执行 `docker compose up -d --build`。这会在所有宿主机接口提供 18080 端口，需自行配置防火墙与网络访问范围。局域网地址为 `http://服务器地址:18080/`；长期手机和公网使用请通过 HTTPS 反向代理访问，以获得安全上下文能力。

如果只改端口但仍只允许宿主机访问，把 `ONECUP_BIND` 保持为 `127.0.0.1`。改变端口会形成新的浏览器存储来源，先导出 JSON 再迁移。

若反向代理本身也在容器里，`127.0.0.1` 是代理容器自己，不是 OneCup。应将双方加入同一 Docker 网络，通过 `onecup:8080` 转发；宿主机是否发布端口由自己的网络配置决定。

## 不使用 Compose

```sh
docker build -t onecup-personal:local .
docker run -d --name onecup --restart unless-stopped --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -p 127.0.0.1:8080:8080 onecup-personal:local
```

镜像来自本机源码构建。此项目目前不承诺已发布可直接拉取的 Docker Hub 镜像，不要使用未经核对的同名镜像。

## 更新与停止

先在网页中导出 JSON，再更新：

```sh
git pull --ff-only
docker compose up -d --build
```

停止并移除服务容器：

```sh
docker compose down
```

上述操作不直接清除浏览器记录，但也不备份记录。数据库随浏览器站点数据清理而删除，换浏览器或访问地址也不会自动同步。详见 [数据与备份](STORAGE.md)。

## 排查

| 问题 | 检查方式 |
| --- | --- |
| 无法连接 Docker daemon | 启动 Docker 服务 / Desktop，并检查当前用户权限 |
| 下载镜像或依赖失败 | 检查宿主机网络及自己的 registry / npm 设置，不把服务凭据提交源码 |
| 端口占用 | 修改 `ONECUP_PORT`，重新创建容器 |
| 宿主机能访问，手机不能访问 | 默认只绑定回环；按上文配置网络接口、HTTPS 和防火墙 |
| 收藏刷新后消失或保存失败 | 看网页保存状态、浏览器存储权限、无痕模式与配额，不是增加 Docker 数据卷 |
| 更新后像是全新数据 | 确认协议、域名、端口和浏览器是否改变，使用旧地址导出的 JSON 恢复 |
| 请求 `/api` 返回 404 | 这是预期行为，v0.2 是无后端版 |

基础镜像标签会随上游更新；需要可重复部署的环境可自行审阅并固定镜像 digest，再按自己的维护节奏升级。
