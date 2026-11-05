# React 与 Go 重构设计

日期 2026-11-05。用户已在选型讨论后授权按 React、Go 和 SQLite 重构整个项目，并要求留下记录。

## 决策

前端继续采用 React、TypeScript、Vite。自部署 API 使用 Go 标准库 net/http，SQLite 使用无 CGO 的 modernc.org/sqlite 驱动。Node.js 仅参与前端构建、领域测试和 Cloudflare 工具链。个人版服务运行时使用 Go 可执行文件。

比较过沿用 Node HTTP、引入 Hono 和迁移 Go。Go 是本次用户选择，交付重点是独立运行、清晰接口、Docker 持久保存和可维护代码。

公开仓库提供共用 React 工具、Go 领域校验、单用户 API、SQLite 存储及 CLI。自营工程直接引用公共前端和 Go 模块，账号适配器单独维护。共同代码以直接引用替代文件复制。

Cloudflare Workers 使用平台专用 TypeScript 适配器。Go 自部署程序和 Worker 必须通过同一组工作区契约样本，数据采用既有 UserData v2。现有 Cloudflare 托管继续按其平台运行，新 Go 服务需要服务器或容器部署。

## 兼容与行为

- 保持单用户 GET/PUT /api/workspace、GET /api/backup、GET /healthz 的路径、JSON 结构和版本冲突语义。
- 保持自营账号注册、登录、退出、账号资料、密码修改、账号删除、账号数据隔离和持久限流。
- SQLite 表结构与文件路径兼容旧部署，v1 JSON 升级至 v2，私人图片、快照、替代撤销信息和咖啡参数完整保存。
- CAS 保存、同内容重试、损坏数据拒绝、备份一致性、恢复前快照和恢复版本增加需要通过真实数据库测试。
- 前端与 API 可分别构建和部署。默认 Go 可同时服务 dist 静态文件，允许前端开发代理访问 API。
- 默认绑定回环地址，校验 Host/Origin，限制请求体大小，提供超时和优雅退出。SQLite 启用 WAL 与 FULL。

## 验收

运行 Go 单元与集成测试、TS 领域与 Worker 测试、跨语言契约测试、前端构建和原生二进制 HTTP/备份恢复烟测。CI 在 Windows/Linux 验证，Docker CI 证明容器重建和离线恢复。文档说明目录职责、启动、部署、迁移、回滚和已知验证限制。

本轮设计不改变配方与界面交互。真实设备操作和浏览器编解码验收独立记录，不由程序测试替代。
