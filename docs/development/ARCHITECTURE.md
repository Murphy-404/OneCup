# 系统架构

2026-11-05。自托管主线为 React / TypeScript + Go 标准库 net/http + SQLite。无需另装数据库服务，无 ORM、消息队列或微服务。

## 模块与依赖方向

| 目录 | 职责 |
| --- | --- |
| src/ | React 页面、材料与配方目录、换算、替代、自制、咖啡、私人做法与合集 |
| src/edition.tsx、workspace.ts、server-store.ts | 单用户工作区状态与 HTTP 持久化适配 |
| backend/domain/ | Go 完整工作区校验、v1 到 v2 归一化、内嵌参考目录 |
| backend/storage/ | SQLite、CAS 版本检查、一致性备份和恢复 |
| backend/httpapi/ | 单用户 HTTP 接口、请求限制、静态资源与来源检查 |
| backend/app/、cmd/onecup/ | 环境配置、CLI、优雅退出、自动备份 |
| cloudflare/ | Workers / D1 专用 TypeScript 适配器与迁移 |
| deploy/、compose.yaml | Nginx 前端与 Go API 分开运行、持久卷 |

浏览器请求同一来源的 /api；开发由 Vite 代理，Compose 由 Nginx 代理。Go 不生成页面业务，也不重新实现 React 交互；前端校验改善交互，后端校验保护持久化边界。生产可拆进程，默认保持同源，避免引入跨域 Cookie 和 CORS 配置。

## 共享与版本边界

本仓库是公共工具代码的唯一来源。其他产品可以直接导入这里的 React / TypeScript 模块，通过 `@onecup/edition` 和 `@onecup/service-info` 注入版本专属状态与说明；React 依赖必须去重。版本专属的账号或社交扩展不得写进公共工具层。

Go 的 domain、storage、httpapi 辅助函数和 app 生命周期可作为 Go module 引用。开发工作区使用 replace 指向本模块，独立构建应固定发布的模块版本或 commit，不能使用未固定的 latest。公共仓库可独立克隆、构建，不依赖任何私人目录。

`shared-toolkit.json` 是共享源文件清单，不再要求把两份源码互相复制。目录、UI、CSS、图片的公共改动在同一来源完成；版本适配器各自回归。

## 前后端数据合约

唯一持久载荷为 schemaVersion 2 工作区，继续兼容 v1 JSON。参考数据来自 src/data.ts 等现有 TypeScript 目录。

```sh
npm run contracts:generate
npm run contracts:check
npm run test:backend
```

生成脚本导出 catalog.json 和正反例合约样例。Go 测试逐条比较 TypeScript 归一化结果；构建时检查产物是否过期。变更材料 ID、配方、替代规则或校验时，必须更新生成文件与对应测试。生成文件不包含用户数据库。

使用 modernc.org/sqlite，无 CGO，可编译为 Windows / Linux 原生程序。运行 Go 程序无需 Node、Go 工具链或 sqlite CLI。Node 仅用于前端构建、开发脚本、测试和 Workers 工具链。

## 平台限制

Cloudflare Workers 不运行本项目的原生 Go HTTP 程序，也不挂载 SQLite 数据盘。现有 Workers/D1 部署继续保留 TypeScript 适配器，前端和领域逻辑共享，平台保存接口单独测试。Go 自托管与 D1 数据不会自动同步；两者迁移使用显式 JSON 导出、验证与导入。

Go 采用单机单数据库部署，SQLite 串行写入，适合私人实例。增加副本不等于共享磁盘；不要让多个容器跨网络文件系统同时写同一 SQLite 文件。
