# 单用户 HTTP API

所有路径同源。此接口没有账号认证；访问控制应由可信网络或外层代理提供。每实例一个工作区。账号扩展有独立协议，不在这里注册 /api/auth。

| 请求 | 结果 |
| --- | --- |
| GET /healthz | 200 文本 ok；确认数据库工作区可读，否则 500 |
| GET /api/workspace | 200 `{data, revision, updatedAt}` |
| PUT /api/workspace | JSON `{data, revision}`；成功返回新的同结构记录 |
| GET /api/backup | JSON 工作区导出附件，仅 data，无外层 revision |

data 是 schemaVersion 2 完整工作区，见 src/types.ts；也可提交可兼容的 v1 载荷。请求 Content-Type 必须是 application/json（可带 charset）。正文上限 5,000,000 字节。revision 是非负安全整数，由上次 GET 获取，禁止猜测或无条件覆盖。

成功写入在 SQLite 事务提交后返回。旧 revision 返回 409，保留现有数据库；同内容重试可返回现有记录，实现网络重试幂等。恢复后版本递增，旧页面不能覆盖恢复结果。

错误体为 `{error: string}`。常见状态：400 数据/JSON/版本无效；403 Host、Origin 或跨站检查拒绝；404 未知接口；405 方法不支持；413 容量超限；415 非 JSON；500 存储不可读/写。500 不向客户端暴露 SQL 或文件路径。

默认仅信任回环 Host。远程部署设置 ONECUP_ORIGIN 为外部完整 HTTP(S) 来源且代理保留原 Host、Origin、Sec-Fetch-Site。来源检查不是身份认证。

Cloudflare 适配器支持相同主要工作区协议，公开只读模式会返回 readOnly 标志并拒绝保存；其持久存储为 D1，不能用原生 SQLite CLI 管理。
