# 艺68班级服务站

清华大学美术学院艺68班的班级服务网站。六八六八，艺路生花。

**线上网站：[thuart68.cn](https://thuart68.cn)** · **许可证：[MIT](LICENSE)**

基于 React、TypeScript、Vinext、Cloudflare Workers 与 D1。公开页面无需登录；管理员使用独立账号维护内容和查看问卷。运行时无需大模型 API。

## 功能

- 班务日志、班级日程、重要通知与意见反馈。
- 生日调查：姓名、公历生日月日、集体生日参与意愿；防止双击或网络重试重复提交。
- 管理后台：维护班务和草稿，查看、筛选、统计生日答卷并导出 CSV。
- 私有附件：单文件最多 10 MiB，D1 按 512 KiB 分块保存；公开读取范围由内容发布状态决定。
- 一次性管理员初始化、密码派生存储、服务端会话校验、退出及改密后会话撤销。
- 管理员完整备份导出；另保留独立 Node / SQLite 部署路线。

## 本地开发

使用 Node.js 22.16 或更高版本、pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
```

在本地生成随机初始化码，将其 SHA-256 摘要填入 .dev.vars 的 ADMIN_BOOTSTRAP_TOKEN_HASH。原始码由自己保管，不写入代码或公开 URL。

```sh
pnpm run db:migrate:local
pnpm run dev
```

首次访问 /admin/login，输入初始化码并设置至少 12 位的管理员密码，用户名为 admin。生日问卷路径为 /survey/birthday，结果管理路径为 /admin/surveys/birthday。

```sh
pnpm test
pnpm check
pnpm build
pnpm exec wrangler deploy --dry-run
```

## 部署

首次部署到自己的 Cloudflare 账号，见 [Cloudflare 部署说明](deploy/CLOUDFLARE.md)。需要创建自己的 D1 数据库并设置管理员初始化秘密；无需 R2。公开配置不包含生产数据库 UUID 或正式域名路由。

已有正式网站的维护、自动部署与本开源仓库的同步关系，见 [维护与发布](deploy/MAINTENANCE.md)。公开仓库目前用于源码发布，生产部署仍由既有私有分支触发。

## 数据与许可

本仓库发布源代码、数据库结构、测试及界面素材。真实答卷、名册、密码、会话、私有附件和备份保存在部署环境中，不包含在源码内。测试使用虚构数据。

原创代码使用 [MIT 许可证](LICENSE)，第三方代码和机构标识见 [第三方说明](THIRD_PARTY_NOTICES.md)。复制部署时请替换班级名称与品牌素材。
