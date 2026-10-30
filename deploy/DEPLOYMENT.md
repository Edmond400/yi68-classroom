> 当前版本：公开问卷无需学生登录。管理员使用独立 admin 账号。下文旧名册变量仅用于保留历史资料，不再是启用问卷的前提。

# 独立部署与迁移

已确定正式域名：`thuart68.cn`（班长已购买）。下文配置已使用此域名，尚未绑定服务器或修改DNS。

## 部署选择

目标是用可在同学网络环境访问的独立域名和服务器承载整个服务，而非只转发原站点页面。

可使用学校提供的 HTTPS 域名与服务器，或班长自己管理的云服务器。若选择腾讯云等国内环境，需按服务商要求准备域名；[腾讯云 CloudBase 的生产环境建议绑定备案自定义域名](https://docs.cloudbase.net/service/custom-domain)，其默认域名有有效期与访问规则，不能当作长期正式地址（[官方公告](https://cloud.tencent.com/announce/detail/2119)）。本项目给出的是普通服务器容器部署包，方便部署到学校服务器、腾讯云或阿里云等环境。

针对当前已完成的服务器版，建议使用腾讯云轻量应用服务器（Lighthouse），不需要另购 CloudBase。可选北京地域、Linux系统，2核2GB作为小班级网站的初始运行配置；正式配置与价格以购买页面为准。若在服务器上构建时内存不足，可以在构建环境生成镜像后再部署，或提高内存，而不是改变数据存储方式。[轻量服务器产品说明](https://cloud.tencent.com/product/lighthouse)

北京地域对外提供网站服务前需完成ICP备案。若用新购轻量服务器申请备案，腾讯云当前要求包年包月累计至少3个月，备案期间剩余有效期至少1个月。域名购买成功并不代表备案已经完成。[腾讯云备案资源要求](https://cloud.tencent.com/document/product/243/18908)

开始迁移前需要确认：服务器访问权限、已经准备好的域名，以及 HTTPS 所需的域名解析。创建收费资源、购买域名与办理备案需由账号持有人完成。不要把云账号密码或长期密钥发在聊天中；通过受支持的账号连接或受控部署环境提供权限。

## 文件与配置

项目包含 `Dockerfile`、`compose.yaml`、`deploy/Caddyfile` 和私有备份导入脚本。容器内运行生产版 Next.js，不使用开发服务器。

在服务器源码目录创建仅管理员可读的 `.env.production`，设置以下内容。示例姓名和学号仅用于说明，实际应填写班长已经提供的完整名册。

```dotenv
SITE_DOMAIN=thuart68.cn
CLASS_ROSTER_JSON='[{"name":"测试同学","student_id":"2030010001"}]'

ADMIN_BOOTSTRAP_TOKEN_HASH=替换为私密初始化码的SHA256摘要
```

初始化码可在受控服务器终端用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成，不提交 Git。将配置文件权限设为600。`SITE_DOMAIN` 填纯域名，不含协议、端口或路径。域名解析到服务器，开放80和443端口；应用3000端口只在容器网络内开放。

服务器开通后，在域名服务商为 `thuart68.cn` 添加主机记录 `@`、类型 `A`、记录值为**该服务器真实公网IPv4地址**的解析。尚未获得公网IP前不填写记录值，不将它转发到原 `chatgpt.site` 地址。当前配置仅接入根域名，`www` 子域名需要另行配置后再使用。

## 首次启动（没有既有数据时）

```sh
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

Caddy按该域名申请HTTPS证书。班长直接进入 `/admin/login`，输入私密初始化码并设置至少12位管理员密码；用户名为 admin，无需名册或学生注册。初始化成功后可删除 ADMIN_BOOTSTRAP_TOKEN_HASH 并重新创建应用容器。已有独立管理员从 v2 备份恢复时无需再次初始化。

## 从当前站点迁移

1. 在原站点暂停班务编辑与同学提交，进入管理后台的“第一次使用：如何更新班务”，下载完整备份。确认接口成功导出，文件中包含数据库与全部附件。不要把私有备份上传到任何公开目录。
2. 将备份安全上传到新服务器的项目目录。保留原站点及原始备份，以便核对和回退。
3. 构建容器，然后在**应用第一次启动前**，将备份导入全新的数据卷。示例：

```sh
docker compose --env-file .env.production build
docker compose --env-file .env.production run --rm --no-deps \
  -v "$PWD/yi68-private.backup.json:/import/private.backup.json:ro" \
  app node scripts/import-backup.mjs /import/private.backup.json
docker compose --env-file .env.production up -d
```

4. 导入脚本会检查格式、表结构、关联关系和附件字节数。目标已有数据库时会拒绝覆盖。若已经启动过空站点，请在明确核实后使用**另一个全新数据卷**，保留旧卷，勿直接删除数据。
5. 在新地址核对日志、方案、日程、通知、附件和私密反馈；学生账号密码保持不变，所有人重新登录。旧 v1 备份若没有独立管理员记录，按上节初始化。
6. 请同学关闭代理，分别使用校园网、手机流量、微信内浏览器，测试首页、首次注册、登录和反馈提交。完成测试后才把公众号入口改为新链接，并停止旧站点写入，避免出现两份不同的数据。

迁移包的完成不等于已经获得服务器、绑定域名或验证国内可达性。

## 数据保管

数据库和附件在 `yi68_data` 持久化卷内。容器重建不会清空该卷。升级前从管理员后台导出备份并保存在另外的位置；不要运行带 `--volumes` 的删除命令。应用暂无定期异地备份服务，需要由服务器管理员安排。

`/api/health` 只返回可用状态，不暴露名册、数据库内容或配置。
