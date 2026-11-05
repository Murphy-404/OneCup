# 部署指南

[文档导航](../README.md) · [Docker](DOCKER.md) · [备份恢复](STORAGE.md)

## 运行条件

源码构建需要 Node.js 24+ 和 Go 1.27.3+；也可直接使用 Docker Compose v2。服务器运行编译产物只需 Go 二进制、前端 dist 和可写数据目录。单用户实例无需登录、数据库账号、邮件和自营服务。保存数据必须运行 API，不能只部署静态 dist/。

Cloudflare 云端可使用 [Workers + D1](CLOUDFLARE.md)，使用独立 TypeScript 平台适配器，不运行 Go 本机数据库。

## Go 原生服务

运行 npm ci、npm run build:all、npm start。默认监听 127.0.0.1:8080，数据为工作目录下 data/onecup.sqlite。

配置以进程环境变量提供：

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| HOST | 127.0.0.1 | 监听地址 |
| PORT | 8080 | 端口 |
| STATIC_DIRECTORY | dist | 静态文件目录；设为 - 时仅提供 API |
| DATABASE_PATH | data/onecup.sqlite | 数据库路径 |
| BACKUP_DIRECTORY | 数据库目录/backups | 自动快照目录 |
| ONECUP_AUTO_BACKUP_HOURS | 24 | 0 关闭，1～168 小时 |
| ONECUP_ORIGIN | 空 | 远程访问的完整 HTTP(S) 来源，不带末尾斜线或路径 |

Go 二进制只读取进程环境变量；npm 脚本会加载本地 .env，已设置的进程变量优先。Compose 则读取项目 .env 中用于插值的变量。数据库目录需有写权限，并能创建 WAL/SHM 文件；不要放进只读程序目录。不要让静态服务器公开 data/。

开发使用 npm run dev，同时运行 5173 前端及 3001 API。单独 vite preview 只供资源检查，不是完整部署方式。

## 远程访问

默认回环地址仅允许本机访问。远程部署须先用可信网络/VPN，或在 HTTPS 反向代理上增加访问控制。将 ONECUP_ORIGIN 设置为实际来源，例如 https://drinks.example.com，代理保留原 Host，转发到回环端口。API 不信任未配置的远程 Host；Origin 与跨站检查仅用于防误用，不是身份认证。任何能访问此实例的设备共用全部记录。

推荐用进程管理器或 Compose 配置重启；健康检查 /healthz 会验证数据库可读。服务不可用时页面不回退到空白浏览器数据库，不显示虚假保存成功。
