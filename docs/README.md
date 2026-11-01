# 文档导航

OneCup Personal 的文档按使用任务分类。第一次使用先看 [项目 README](../README.md)，完整授权条款见 [LICENSE](../LICENSE)。

## 快速查找

| 你要做什么 | 文档 | 分类 |
| --- | --- | --- |
| 了解功能、安装并启动 | [项目介绍与快速开始](../README.md#快速开始) | 根目录入口 |
| Node.js 或 Docker 自托管 | [部署指南](guides/DEPLOYMENT.md) | 使用与部署 |
| 用 Docker Compose 部署和更新 | [Docker 部署](guides/DOCKER.md) | 使用与部署 |
| 了解 SQLite、旧记录迁移和 JSON 备份 | [数据与备份](guides/STORAGE.md) | 使用与部署 |
| 查看已实现能力和后续计划 | [路线图](product/ROADMAP.md) | 产品规划 |
| 了解 AI 图片、配方来源与素材边界 | [素材说明](reference/ASSETS.md) | 素材与参考 |
| 核对当前配方、规格、器具与替代规则 | [配方与规则核对](reference/配方与规则核对.md) | 素材与参考 |
| 查看本次发布做过哪些测试 | [发布验证记录](testing/VALIDATION.md) | 测试与质量 |
| 判断个人使用、署名与商用限制 | [许可证](../LICENSE)、[中文使用说明](../README.md#使用授权与来源标注) | 授权 |
| 核对依赖许可证 | [第三方声明](../THIRD_PARTY_NOTICES.md)、[许可文本](../licenses/) | 授权 |
| 报告问题或提出修改 | [贡献指南](../CONTRIBUTING.md) | 协作 |
| 报告潜在安全问题 | [安全说明](../SECURITY.md) | 安全 |

## 目录结构

```text
docs/
  README.md                  文档总入口
  guides/DEPLOYMENT.md        Node.js 与 Docker 自托管
  guides/DOCKER.md            Docker 部署
  guides/STORAGE.md           服务器数据库、迁移与备份
  product/ROADMAP.md          产品范围与后续计划
  reference/ASSETS.md         素材来源与使用边界
  testing/VALIDATION.md       发布验证
  images/                    README 截图
```

LICENSE、SECURITY.md、CONTRIBUTING.md 和 THIRD_PARTY_NOTICES.md 保留在仓库根目录，方便 GitHub 识别与直接访问。新增文档应放入对应目录，并在本页登记；移动时同步更新链接。

- [完整产品 PRD](product/PRD.md)：范围、优先级、数据与验收要求。
