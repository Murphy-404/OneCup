# 从 Node 自托管迁移到 Go

2026-11-05。本指南仅针对无账号的 OneCup Personal SQLite。账号版数据库和 Cloudflare D1 不可直接当作本实例数据库。

## 迁移前

1. 在旧界面导出一份完整 JSON，另保存旧程序版本/commit。
2. 用旧版本 CLI 创建一致性 SQLite 备份并复制到另一台设备。运行中的数据库可能使用 WAL，不能只复制主 .sqlite 文件。
3. 停止旧服务。确认原 DATABASE_PATH 或 Compose 数据卷名称，避免误连新建空库。

## Docker 升级

Compose 保持服务名 onecup、命名卷 onecup_personal_data、路径 /data/onecup.sqlite，以及原 UID/GID 1000。新增 web 服务对外提供 8080，onecup 仅在容器网络运行 Go API。

```sh
git pull --ff-only
docker compose up -d --build --remove-orphans
docker compose ps
docker compose logs --tail 100
```

不删除数据卷。若旧部署覆盖了 ONECUP_VOLUME、端口或数据库路径，先保留相同设置。自定义宿主目录仍需允许 UID 1000 写入。

## 源码部署升级

需要 Node 24+、Go 1.27.3+ 构建：

```sh
npm ci
npm run build:all
npm start
```

让新服务使用原 DATABASE_PATH。既有 workspace 表和 revision 协议不变，不复制或清空用户记录。v1 载荷在读取时归一化为 v2；首次保存写入归一化结果。图片、配方、合集固定快照都在同一工作区载荷内。

直接运行时使用 backend/bin/onecup（Windows 为 onecup.exe），工作目录为项目目录。Go 二进制只读取进程环境；npm 启动脚本会加载本地 .env。

## 验收与回退

打开原地址，核对收藏、材料、器具、自建图片、私人做法、合集与备料；做一次小修改并重启检查持久化，再创建新快照并运行 verify。不要用生产记录跑自动化测试。

若需回退，先停止 Go，导出升级后的 JSON 并创建 SQLite 快照，再运行旧 commit 与迁移前的数据库备份。新旧程序不得同时提供可写服务。虽然表结构保持兼容，推荐使用迁移前备份回退，避免把后续格式变更交给旧程序解析。

Go 恢复命令见 [数据与备份](STORAGE.md)。恢复会增加 revision 并保留 before-restore 快照；旧页面须刷新或解决冲突。
