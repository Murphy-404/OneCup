# Docker 自托管

[文档导航](../README.md) · [部署](DEPLOYMENT.md) · [备份](STORAGE.md)

## 首次运行

```sh
git clone https://github.com/Murphy-404/OneCup.git
cd OneCup
docker compose up -d --build
docker compose ps
```

打开 http://127.0.0.1:8080/。web 服务以 nginx 用户提供静态前端并代理 /api；onecup 服务以 onecup 用户（UID/GID 1000，兼容旧卷）运行 Go API。API 程序目录只读，仅 /data 命名卷和 /tmp 可写；SQLite 自动创建，不需安装额外数据库。

## 卷与更新

compose.yaml 把命名卷 onecup_personal_data 挂到 /data。容器移除和重建保留此卷；固定卷名也避免只因项目文件夹变更而创建另一份空数据库。同一机器运行多个独立实例时，须为每个实例设置不同 ONECUP_VOLUME 和端口。

更新前先按 [备份指南](STORAGE.md) 保留离机副本，然后：

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
```

停止用 docker compose down。不要在日常更新时删除卷，不要把数据卷清理当成程序清理。数据卷不是离机备份；磁盘损坏或人为删除仍会丢失记录。

## 配置示例

在项目目录创建 .env（不提交仓库）：

```dotenv
ONECUP_PORT=8080
ONECUP_BIND=127.0.0.1
ONECUP_VOLUME=onecup_personal_data
ONECUP_AUTO_BACKUP_HOURS=24
```

如使用外部访问入口，另设置 ONECUP_ORIGIN 为实际完整来源，例如 https://drinks.example.com，并配置带访问控制的 HTTPS 反向代理。开放到可信局域网时同时配置绑定地址与实际来源；没有账号隔离，能访问者共用记录。

如果改用宿主目录绑定 /data，先确保宿主目录允许容器 onecup 用户（UID/GID 1000）写入；命名卷无需手动设置所有权。错误权限、磁盘满或只读挂载会导致保存失败，检查 docker compose logs 和 /healthz，先导出页面中的未保存修改。

## 验证持久性

先在界面保存一份测试配方并等待“已持久保存”，再执行 docker compose up -d --force-recreate；刷新页面，应恢复同一记录。CI 会在一次性实例自动执行该过程，并验证备份恢复。
