# 一杯 · OneCup Personal

**无需登录，把手边材料变成喜欢的饮品。**

[文档导航](docs/README.md) · [部署指南](docs/guides/DEPLOYMENT.md) · [Docker 部署](docs/guides/DOCKER.md) · [数据与备份](docs/guides/STORAGE.md) · [许可证](LICENSE)

OneCup Personal 是面向家庭的饮品制作工具，包含咖啡、茶饮、果饮和鸡尾酒。**从 v0.2 起采用纯静态架构，不包含用户登录、服务端账号、SQLite、D1、邮件或云同步。** 收藏、材料、个人做法与备料保存在使用者自己浏览器的 IndexedDB 数据库。

> **仅限个人非商业使用，必须注明来源。** 这是采用自定义许可的源码公开项目，不属于 OSI 定义的开源软件；商业或组织用途须另获授权。完整条款见 [LICENSE](LICENSE)。

## 先部署，再使用

### 方式一：Docker Compose（推荐自托管）

需要已安装并启动 Docker Engine / Docker Desktop，以及 Docker Compose v2。首次构建需要联网下载基础镜像与 npm 依赖。

```sh
git clone https://github.com/Murphy-404/OneCup.git
cd OneCup
docker compose up -d --build
```

打开 **http://127.0.0.1:8080/**。不需要配置账号、环境密钥、数据库或数据卷。

```sh
docker compose ps          # 查看状态
docker compose logs -f     # 查看网页服务日志
docker compose down        # 停止并移除容器
```

默认仅绑定宿主机回环地址。局域网访问、端口修改、HTTPS 反向代理、更新和常见问题见 [Docker 部署指南](docs/guides/DOCKER.md)。

### 方式二：本地开发

需要 Node.js 24+ 和 npm。

```sh
git clone https://github.com/Murphy-404/OneCup.git
cd OneCup
npm ci
npm run dev
```

打开终端显示的地址，通常为 **http://127.0.0.1:5173/**。启动的只有 Vite，不会连接后台服务。

### 方式三：部署静态文件

```sh
npm ci
npm run build
```

将生成的 **`dist/` 内容**放到 Nginx、静态主机或 Cloudflare 静态资源托管。无需运行 Node API 或创建数据库；根路径托管与单页回退配置见 [部署指南](docs/guides/DEPLOYMENT.md)。

仅在本机预览构建结果：

```sh
npm start
```

打开 **http://127.0.0.1:8080/**。`npm start` 是 Vite 预览，正式服务推荐使用 Docker / Nginx 或静态托管。

## 用户数据在哪里？

使用浏览器自带的 **IndexedDB**，数据库名 `onecup-personal`，对象仓库 `workspace`，记录键 `current`。它是浏览器管理的本机数据库，不是服务器上的共享 SQLite 文件。网页服务只传输程序和图片，不接收个人记录。

| 内容 / 操作 | 行为 |
| --- | --- |
| 收藏、材料、器具、个人做法、备料、咖啡记录、主题 | 自动写入当前浏览器的 IndexedDB，事务提交后显示保存成功 |
| 刷新或重新打开同一地址 | 从本机数据库恢复 |
| 不同设备或浏览器 | 记录各自独立，不自动同步 |
| 换协议、域名或端口 | 视为不同来源，看不到原地址的记录，需要迁移备份 |
| 同源旧版游客记录 | 初次升级尝试从 `localStorage: onecup.data.v1` 迁移，保留旧记录 |
| 旧版本服务器账号记录 | 不自动迁移；先在旧版导出 JSON，再在此版恢复 |
| 删除或更新 Docker 容器 | 不直接影响浏览器数据，也不会替浏览器做备份 |
| 清理站点数据、无痕窗口关闭、浏览器存储回收 | 可能丢失记录，需靠自己保管的 JSON 恢复 |

在右上角「本机数据与备份」导出或恢复 JSON。保存失败时当前修改保留在页面内，先导出再重试，未提交前不要关闭页面。多标签页有版本检查，冲突不会静默覆盖。

**不要把“数据库在本机”理解为永久不会丢失。** 请定期导出。备份含私人笔记和库存，不上传公开 Issue。原理、迁移与冲突处理见 [数据与备份指南](docs/guides/STORAGE.md)，浏览器存储边界参见 [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)。

## 当前功能

- 24 款家庭参考配方，分类、名称/材料搜索与主动随机。
- 材料和器具状态，解释直接可做、自制或近似路径的条件。
- 4 条限定范围的替代/自制规则，采用后同步更新用量、器具和步骤，支持逐项撤销。
- 0.5～20 份换算、原料编辑、完整个人做法快照和私人笔记。
- 分步制作、本步用量、材料勾选、器具说明和手动计时。
- 完整成品图、放大和部分杯型切换；图片为 AI 示意。
- 多杯备料、咖啡参数计算与记录、JSON 导出和校验恢复。

尚未实现从空白创建任意配方的完整编辑器、私人合集、PWA 完整离线缓存、跨刷新制作恢复和原生 App，见 [路线图](docs/product/ROADMAP.md)。没有登录、公开作者资料、社区、配方公开分享或账号同步。

参考配方与替代方案待实际试做；材料库存只记录种类，不保证数量足够。咖啡豆不是现成咖啡液，质量与体积不默认互换，杯型图片不自动修改份数。计时器在刷新或离开制作页后结束，不提供系统通知。

## 界面预览

顶部导航与图片卡片网格，手机优先。下图为无登录版：

![无登录版手机首页](docs/images/home-mobile.png)

## 开发与测试

```sh
npm ci
npm run build
npm test
npm run audit:content
```

测试使用 `fake-indexeddb` 验证事务提交、跨连接恢复、旧记录迁移、并发写入、存储失败与损坏数据，并回归配方计算、替代、备料和快照。CI 在 Linux、Windows 运行应用测试，另在 Linux 实际构建并启动只读 Docker 容器做静态服务检查。具体执行记录见 [验证说明](docs/testing/VALIDATION.md)。

```text
src/               界面、饮品逻辑、本机数据库与保存队列
public/            参考饮品与杯型 AI 示意图
tests/             领域与 IndexedDB 测试
docker/            Nginx 静态服务配置
Dockerfile         前端构建 + 非 root 网页服务
compose.yaml       单容器部署，无数据库卷
scripts/           内容核对与静态容器检查
docs/              分类文档及界面截图
licenses/          第三方许可文本
```

## 授权、素材与贡献

来源：**[OneCup by Murphy-404](https://github.com/Murphy-404/OneCup)**。

项目自有代码采用 [OneCup Personal Non-Commercial Attribution License 1.0](LICENSE)：允许自然人的个人非商业使用、修改和再分发，必须保留来源、版权和许可。修改版须说明修改；界面在页脚、关于页或同等可见位置标注 `Based on OneCup by Murphy-404` 并链接原项目。商业、组织及代商业主体使用须单独授权。

第三方代码保留自身权利，见 [第三方声明](THIRD_PARTY_NOTICES.md)。AI 图片与配方来源边界见 [素材说明](docs/reference/ASSETS.md)。源码公开与 OSI 开源的区别见 [OSI 定义](https://opensource.org/osd)。

问题反馈使用仓库 Issues，不提供完整私人备份。贡献与安全说明见 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md)。
