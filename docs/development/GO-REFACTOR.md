# Go 重构记录

日期：2026-11-05。目标：前后端分离、保持已有产品能力、服务端持久保存、减少自托管运行依赖。

## 已完成的结构变更

- 保留 React + TypeScript + Vite，原有页面、布局、换算、替代、自制、咖啡、图片和私人合集继续使用同一份工具代码。
- 以 Go net/http + modernc SQLite 替换自托管 Node HTTP / node:sqlite 服务，移除旧 server/ 和 build-server 脚本。
- 分为 domain、storage、httpapi、app、cmd 模块；前后端通过 JSON / HTTP 交互。
- 保留既有表结构、数据版本、乐观锁与备份语义；Go CLI 实现 backup、verify、restore 和 healthcheck。
- Compose 拆分 Nginx web 与 Go onecup API，数据卷、UID、路径保持兼容，两个运行镜像均使用非 root 用户。
- Workers/D1 保留独立 TypeScript 平台适配；不把 Go 服务宣称为 Workers 原生运行程序。
- 增加 Go 依赖许可文本、生成目录与前后端合约一致性检查。

## 决策与修复依据

选择 Go 标准库以减少单用户工具的框架依赖；SQLite 驱动无 CGO，程序可独立运行。没有引入 ORM、账号到单用户版或新的前端框架。

回归中增加了缺失工作区记录、损坏数据库、过期版本并发写入、超大请求末尾空白、旧快照长文本、静态资源路径与 HEAD 的测试。数据库异常会报错，不重置为空工作区。静态资源使用受限文件根目录，并设置 CSP。

## 验证入口

```sh
npm ci
npm run build:all
npm test
npm run test:backend
npm run test:native
npm run test:cf
```

Go 合约样例包含 v1、完整 v2 图片与合集、自建草稿、所有参考配方、替代与撤销、非法引用和超限数据。原生冒烟测试使用隔离临时目录，并清空子进程 PATH，验证无 Node/Go 运行环境时的 HTTP、图片、重启、旧 Node 数据库读取、备份和恢复。

Go 测试新增真实 SQLite 事务并发冲突和备份恢复；前端既有业务测试继续保留。GitHub Actions 配置 Windows/Linux 构建、Go 测试、原生冒烟、Workers/D1 和 Docker 重建恢复测试。

本地开发机未安装 Docker；commit `00b5809` 的 [CI](https://github.com/Murphy-404/OneCup/actions/runs/42021139437) 已实际通过 Windows/Linux、Docker 构建、容器重建持久化和 SQLite 恢复。初次发现的 Nginx PID 权限问题已用显式 /tmp 路径修复。此轮不新增视觉改版；没有新增真实手机人工回归。Go 原生服务尚未部署公网服务器，现有 Workers 地址不等同于 Go 运行环境。详细测试记录见 [验证记录](../testing/VALIDATION.md)。

原始 [设计](../superpowers/specs/2026-11-05-go-refactor-design.md) 和 [实施计划](../superpowers/plans/2026-11-05-go-refactor.md) 留作决策记录；运维请优先使用当前部署、迁移和备份指南。
