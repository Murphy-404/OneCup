# Go 重构实施计划

设计依据 [重构设计](../specs/2026-11-05-go-refactor-design.md)。按用户授权在当前工程执行，公共仓库使用 refactor/go-backend 分支。

## Task 1 契约与 Go 领域校验

- 导出参考目录、材料、器具和 TS 校验的有效/无效样本，生成 Go 可嵌入数据。
- 先以 Go 测试定义 JSON v1/v2、图片、快照、草稿、合集、咖啡和替代语义，观察缺少实现的失败。
- 实现独立 Go 校验，运行 go test ./domain。TS 生成器 --check 确保提交数据未过期。

## Task 2 Go SQLite、API 与 CLI

- 测试旧 SQLite 直接读取、CAS 并发、幂等重试、损坏文件与数据、备份及恢复。
- 实现 storage、httpapi、cmd/onecup。保持原环境变量和 HTTP 接口。
- 以真实临时目录运行 go test ./...，再启动二进制并执行 HTTP、备份、校验和恢复烟测。

## Task 3 自营账号与共用代码引用

- 自营 Go 模块通过本地 replace 引用公开模块，保持旧账号 SQLite、scrypt 凭据和会话兼容。
- 共用 React 通过版本入口别名引用，私有账号和存储入口保留在自营工程。
- 将复制同步改为直接引用检查，两个前端构建及账号隔离、限流、密码轮换测试通过。

## Task 4 构建、Docker、CI 和文档

- 默认 npm start/dev:api 使用 Go，前端构建与后端构建分别提供命令。
- Docker 多阶段构建前端与 Go 二进制，运行镜像以非 root 用户运行，数据卷名称和路径兼容。
- CI 包含 Go、契约、TS 和 Docker 重建/恢复。维护 Cloudflare 独立适配验证。
- 更新 README、架构、API、迁移、部署与恢复记录，声明 Go 尚需服务器部署。

## Review Focus

旧账号数据库与个人数据库隔离，错误不触发空库覆盖。多设备 CAS 必须在同一事务读取返回值。备份不覆盖活动文件或已有文件。私人图片以及替代撤销信息须跨 TS/Go 一致。账号密码轮换必须废止旧会话。公开产物不引入私有账号实现或配置。
