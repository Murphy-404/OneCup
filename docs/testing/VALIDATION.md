# v0.2 无登录静态版验证

日期：2026-11-01。对象为 OneCup Personal 独立公开源码，不是自营网站。

## 本地执行结果

| 检查 | 结果 |
| --- | --- |
| `npm run build` | TypeScript 与 Vite 通过 |
| `npm test` | 52 项通过，其中 10 项 IndexedDB 测试、2 项静态版本契约检查 |
| `npm run audit:content` | 生成当前参考目录与规则核对记录，不等同于试做 |
| 浏览器保存 | 无登录入口；收藏后等待本机保存完成，刷新后记录保留 |
| 数据设置 | 显示 IndexedDB、本机隔离、JSON 备份与恢复说明 |
| 手机布局 | 390 × 844，无横向溢出，界面图已更新 |

IndexedDB 测试覆盖：空记录、跨连接恢复、旧游客记录迁移、不覆盖已有数据、损坏旧数据、损坏数据库、跨标签页并发冲突、无效输入、写入空间不足与事务失败、并发迁移以及数据库不可用。测试不会读取真实个人数据。

## Docker 与跨平台 CI

本地执行环境未安装 Docker，不能把 Dockerfile 静态检查写成容器运行成功。GitHub Actions 的 `docker-smoke` 作业负责实际执行：

1. 校验 Compose 配置，执行 README 中的 `docker compose up -d --build`，构建多阶段镜像。
2. 以 Compose 声明的只读根文件系统、临时目录和移除 capabilities 的方式启动非 root 网页容器。
3. 检查 `/healthz`、首页、JS、图片、LICENSE 和 SPA 回退。
4. 确认账号/数据 API 和缺失静态文件返回 404。

Compose 的自定义端口变量、自己的网络和宿主机防火墙仍需部署者验证。CI 运行结果以 [Actions](https://github.com/Murphy-404/OneCup/actions) 对应提交为准；Linux、Windows 的应用构建和测试另行执行。

## 旧版本边界

v0.1 发布时曾验证 45 项应用测试和 7 项 Worker/D1 集成测试。那些验证包含账号与数据库适配器，不能作为 v0.2 当前能力描述。v0.2 已移除这些后端与测试，使用新的本机数据库测试，同时保留饮品领域回归。

浏览器存储仍可能被主动清理或回收；代码测试不代替用户备份、实体设备复验及参考配方试做。
