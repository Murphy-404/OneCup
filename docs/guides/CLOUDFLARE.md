# Cloudflare Workers + D1

[文档导航](../README.md) · [Docker](DOCKER.md) · [数据备份](STORAGE.md)

## 架构与模式

Cloudflare 部署使用 Workers 静态资源与独立 D1 数据库。Node/Docker 继续使用本机 SQLite，JSON 数据格式相同；浏览器不承担持久存储。Worker 更新不会重建或清空 D1，迁移只在数据库首次创建结构。

配置 WORKSPACE_MODE：

| 值 | 行为 |
| --- | --- |
| readonly（默认，任何其他值也只读） | 公开演示；浏览、用量调整、制作可用，不允许改动服务器记录 |
| editable | 单工作区可写；所有能访问的人共用记录，必须按使用场景配置可信访问入口 |

无登录不代表每个访问者有独立空间。仅自己使用时，应先配置 Cloudflare Access 或等效访问限制；不要把私人工作区无意开放给陌生人。只改界面不能保护写接口，本项目在 Worker 中拒绝只读模式下的 PUT 请求。

## 首次部署

需要自己的 Cloudflare 账号，Node.js 24+，依赖通过 npm ci 安装。Cloudflare 默认子域名可以使用，无需购买域名。

```sh
npm ci
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler login
npx wrangler d1 create onecup-personal-db --config wrangler.jsonc
```

按命令返回结果编辑 wrangler.jsonc：填入新数据库 ID，设置自己的 Worker 名称、D1 数据库名称，以及 APP_ORIGIN 为实际的完整 HTTPS 来源。来源不带末尾斜线和路径；不要复用其他产品的账号数据库。实际配置已被 Git 忽略，仓库只提交无真实账号/数据库 ID 的示例。

```sh
npm run cf:deploy
```

该命令依次构建、校验 Worker 类型、应用迁移并上传代码与图片。默认 readonly；确认可信访问方式后才能按需设置 editable。无需密码计算、邮件服务或自动开通付费套餐。实际额度以 Cloudflare 账号套餐为准，达到平台限制可能导致请求失败。

## 更新与测试

```sh
npm run test:cf
npm test
npm run cf:deploy
```

test:cf 使用本地真实 Workers/D1 模拟器验证持久数据、版本冲突、原子分块、只读保护、跨站请求和独立账号边界。CI 同时测试 Node/SQLite 与 Worker/D1。

D1 将大工作区分块保存，版本比较、写入各分块和清理旧分块在一个 batch 事务中完成。读取同样是一个事务，防止并发产生混合快照。失败时不写入空工作区。

## 备份与恢复

界面 JSON 备份兼容 Node/Docker，可从私人实例导出后迁移。恢复 JSON 会替换整个工作区，仅在可写且访问受控的实例执行，并先导出当前内容。

可额外导出 D1 SQL，在仓库外保管备份：

```sh
npx wrangler d1 export DB --remote --output backups/onecup-d1.sql
npx wrangler d1 time-travel info DB
```

先确保 backups 目录存在。数据库恢复与 Time Travel 的保留窗口按实际套餐、官方说明和后台状态核对，恢复前记录当前书签并保留离机副本。不要把 SQL 导出、真实配置或私人 JSON 提交到 GitHub。

参考：[静态资源](https://developers.cloudflare.com/workers/static-assets/)、[D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)。
