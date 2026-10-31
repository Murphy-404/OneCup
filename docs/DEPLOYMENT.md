# 个人自托管与备份

本项目仅授权个人非商业用途。使用自己的服务与数据库，不需要作者的运营账号。请先阅读 [README](../README.md) 与 [LICENSE](../LICENSE)。

## Node + SQLite

开发使用 Node 24+、`npm ci`、`npm run dev`。正式运行先执行 `npm run build`，然后以 `npm start` 提供网页和 API。

可复制 `.env.example` 为 `.env`。下列为需要自行替换的配置示意：

```dotenv
NODE_ENV=production
APP_ORIGIN=https://your-domain.example
HOST=127.0.0.1
PORT=3001
DATABASE_PATH=/your/persistent/path/onecup.sqlite
```

Windows 使用实际存在、可写的绝对路径，例如 `DATABASE_PATH=D:/OneCupData/onecup.sqlite`。父目录需要允许服务进程写入。不要提交 `.env`、数据库或真实域名配置。

通过反向代理在 HTTPS 下提供同一来源的网页和 `/api`，保留请求 Cookie、方法与 JSON 请求体。`APP_ORIGIN` 必须与浏览器实际访问的来源一致，不能混用两个域名或端口。生产 Cookie 带 Secure。使用进程管理器恢复进程，持久化数据目录，限制数据库文件权限。

Node 适配器没有验证邮件和密码找回流程。它适合作为了解此限制的个人实例，不应以“完整公开注册服务”宣传。密码使用派生哈希；不要开启其他分支中可能存在的历史明文测试配置。

## Cloudflare 本地开发

```sh
npm run dev:cf
```

首次运行会生成参考目录 SQL、应用本地迁移和启动 `127.0.0.1:8787`。配置中 `PLAINTEXT_PASSWORD_TEST=false`；邮件预览只在 `ENVIRONMENT=local` 且访问回环地址时可用。注册后使用页面返回的本地预览链接验证，再登录。密码派生比模拟账号耗时，不要误认为卡顿就改为明文。

## Cloudflare 自行发布

发布会改变你的云资源；确认自己的账号、资源与套餐后再执行。密码派生需要较高 CPU 预算，免费请求 CPU 额度可能不够。仓库不自动购买套餐、不自动创建生产数据库，也不内置作者的配置。

1. `npx wrangler login` 登录自己的账号。
2. `npx wrangler d1 create onecup-personal` 创建自己的 D1，将返回 ID 写到 `wrangler.jsonc` 顶层 `d1_databases[0].database_id`。
3. 将顶层 `name` 和 `APP_ORIGIN` 改为自己的服务名与 HTTPS 来源，设置自己的有效发件地址 `EMAIL_FROM`。
4. 配置可发送该域名邮件的服务。Resend 适配器可用 `npx wrangler secret put RESEND_API_KEY` 写入密钥，或按所选邮件绑定调整配置。不把密钥写到 Git。
5. 在自己的 Cloudflare 账户确认合适的 Workers 套餐和 CPU 限额后，显式配置 `limits.cpu_ms`，例如 10000。该数值是预算上限，不是性能保证。
6. 保持 `ENVIRONMENT=production`、`DEV_EMAILS=false`、`PLAINTEXT_PASSWORD_TEST=false`。
7. 执行下面的命令，只操作自己刚配置的数据库。种子脚本更新参考目录，不应拿真实用户数据库导出来代替它。

```sh
npm run cf:seed
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --file cloudflare/seed.sql
npm run cf:deploy
```

发布脚本会校验来源、示例 ID、发信地址、密码模式及显式 CPU 预算，再构建和上传。不会自动跑远端迁移、导入种子或修改套餐。

每次发布后检查 `/api/health`、图片、邮件注册/验证、登录、保存和退出；在目标网络实测，不能仅凭域名可解析就判定完整服务可用。默认域名是否能在某地区访问不作保证。

## 备份、恢复与升级

### 用户 JSON

在设置中导出当前记录。JSON 不含账号密码，但仍可能有私人笔记与库存，不要在公开 Issue 上传。恢复前校验范围，旧格式升级失败时保留原数据。

### SQLite

停止服务后备份完整数据库并确认没有其他写进程；运行中应使用 SQLite 一致性备份能力，不把单独复制主文件当作可靠的 WAL 在线备份。恢复到隔离位置检查后再替换实际数据库，保留旧副本和回退步骤。

### D1

```sh
npm run backup:remote
npm run verify:backup -- path/to/database.sql
```

第一条明确导出当前 Wrangler 配置对应的远端 D1，并在 `.private/backups/` 隔离恢复验证。第二条只验证已有 SQL。上述文件包含账号与私人数据，不能提交仓库。先备份自己的库，再升级；生产 D1 回切需按自己的运维流程执行，不通过本项目自动覆盖。

恢复旧备份可能重新出现已删除账号，应核对删除请求与会话状态。备份保留期限、支持渠道和日志策略由部署者自行确定并如实告知使用者。
