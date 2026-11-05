# 数据、迁移与备份

[文档导航](../README.md) · [部署](DEPLOYMENT.md) · [Docker](DOCKER.md)

## 保存位置

权威数据在服务端 SQLite：Go 默认为 data/onecup.sqlite，Docker 为 /data/onecup.sqlite，位于命名卷 onecup_personal_data。浏览器保留当前页面内存，不作为持久数据源。不同浏览器、设备访问同一实例共用工作区，清理浏览器不会删除服务器已保存记录。

工作区包含收藏、材料、器具、私人做法、备料、咖啡记录、自建配方草稿、合集和主题。没有用户、密码、邮箱和会话表。自建配方上限 200、做法 1000、合集 100×50 条、备料 30 杯、萃取记录 100 条；JSON 请求/导入上限 5 MB。

SQLite 使用 WAL 与 FULL 同步，写入比较版本。提交后才显示已保存；保存错误保留页面修改，版本冲突由用户选择。网络错误不创建本地替代工作区，请先导出当前修改再重试。

## JSON 导出与迁移

打开「服务器数据与备份」导出当前页面数据（包括尚未保存修改），或选 JSON 文件校验后确认替换。恢复影响全部连接设备。v1 自动升级为 v2，保留旧字段并补全空的自建配方与合集；不支持的格式、损坏引用或超限内容拒绝，不覆盖现有记录。

v0.2 浏览器数据只在原来源可读取：从旧地址导出，再到新版恢复；同来源可以点“导入旧浏览器记录”，先预览再确认，不自动覆盖服务器。旧账号数据库不直接复用；从原产品导出 JSON 后导入。

合集导出是一份仅含该合集的可恢复工作区，恢复时仍会替换全部记录，先保留完整备份。它不生成公开地址。

## SQLite 一致性备份

不要在服务运行中直接复制 onecup.sqlite 文件而忽略 WAL。使用内置一致性备份：

```sh
docker compose exec -T onecup /app/onecup backup /data/backups/manual.sqlite
docker compose exec -T onecup /app/onecup verify /data/backups/manual.sqlite
docker compose cp onecup:/data/backups/manual.sqlite ./onecup-backup.sqlite
```

目标文件须为新文件名，避免覆盖旧备份。默认启动时与每 24 小时生成 auto-*.sqlite；同卷快照不是离机备份。不会自动清理，请监控空间并将重要快照复制到其他设备。

本地 Go 对应命令为 npm run backup -- ./backups/manual.sqlite 和 npm run verify:backup -- ./backups/manual.sqlite，使用相同 DATABASE_PATH。

## 恢复 SQLite 快照

先备份当前实例，再把恢复文件放入共享卷并校验：

```sh
docker compose cp ./onecup-backup.sqlite onecup:/data/backups/restore.sqlite
docker compose exec --user root -T onecup chown 1000:1000 /data/backups/restore.sqlite
docker compose exec -T onecup chmod 600 /data/backups/restore.sqlite
docker compose exec -T onecup /app/onecup verify /data/backups/restore.sqlite
docker compose stop onecup
docker compose run --rm --no-deps onecup restore /data/backups/restore.sqlite --confirm-replace
docker compose up -d
```

首次运行已创建 /data/backups；若关闭自动备份且该目录不存在，先执行手动备份创建目录。不要将导入文件覆盖活动数据库。恢复先验证完整性与业务格式，并自动保存 before-restore-* 快照，再事务替换工作区、增加版本。旧页面再次写入会发生冲突，不能覆盖已恢复记录。

本地 Go：npm run restore -- ./backups/manual.sqlite --confirm-replace。停下普通服务再恢复，保持相同 DATABASE_PATH；恢复文件不可替代数据盘权限和空间检查。
