# 部署到自己的 Cloudflare Workers + D1

此说明用于复制部署。艺68现有正式网站的发布链路见 [MAINTENANCE.md](MAINTENANCE.md)。

## 1. 准备数据库

安装锁文件指定的依赖并登录自己的 Cloudflare 账号：

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler d1 create yi68-classroom
```

将返回的数据库 UUID 写入本地配置：

```sh
node scripts/configure-cloudflare.mjs <自己的数据库UUID>
```

wrangler.json 的 Worker 名称与数据库名称可以按需修改；DB 绑定名称需与代码保持一致。使用自己的数据库和生产资源。附件保存在 D1，无需创建 R2 桶。

## 2. 设置管理员初始化秘密

自己生成至少 32 个随机字符的一次性初始化码，计算 SHA-256，将摘要设置为运行时加密秘密：

```sh
pnpm exec wrangler secret put ADMIN_BOOTSTRAP_TOKEN_HASH
```

在命令提示中输入摘要。原始初始化码仅由管理员保管，不提交仓库。首次打开 /admin/login，输入原始码并设置至少 12 位的管理员密码。初始化完成后该入口改为登录，用户名为 admin。

本地开发使用 .dev.vars，生产秘密通过 Cloudflare 配置。密码、API 令牌、名册、真实答卷或备份不能提交 GitHub。

## 3. 验证并发布

```sh
pnpm test
pnpm check
pnpm build
pnpm exec wrangler deploy --dry-run
pnpm run deploy
```

部署命令会先按序应用 drizzle/ 中尚未执行的迁移，再部署 Worker。已有数据库的迁移只能追加，不能修改或重新执行已应用文件。使用新的空数据库可避免与其他迁移管理器冲突。

## 4. 可选的 GitHub 自动部署

在 Cloudflare Workers Builds 中连接自己的仓库和生产分支，构建命令为 pnpm run build，部署命令为 pnpm run deploy。使用项目规定的 Node / pnpm 版本与锁文件。部署令牌需具有相应账号的 Workers 发布与 D1 编辑权限。

推送生产分支后仍需确认构建和部署成功，再检查网站。外部构建服务的权限、配额与账单取决于自己的账号。

## 5. 可选的自定义域名

在已经激活的 Cloudflare DNS zone 内，为自己的 Worker 添加自定义域名；也可以在 wrangler.json 添加自己的 routes 配置。域名、DNS 和证书应以账号实际返回的值为准。

HTTPS 访问成功不能证明所有地区与运营商的直连效果。若有校园网、手机流量或微信访问要求，应在相应环境中实测。

## 6. 数据与验收

源码没有原站数据，新数据库部署后为空。scripts/import-backup.mjs 恢复的是独立 Node / SQLite 环境，不能作为 D1 导入工具。

上线后用虚构信息检查提交、管理查看和 CSV 导出，并确认未登录请求无法读取答卷、统计或私有备份。管理员备份不导出有效会话，附件合计 20 MiB 是当前单次完整备份的限制。

## 活动系统与自动结算

发布入口改为 `worker.ts`，委托原Vinext fetch处理器并增加scheduled处理器。保留D1、域名与运行时秘密，部署仍先迁移再发布。`triggers.crons` 每分钟检查到期的月奖与学期奖，条件更新保证同一期只存一份结果；访问 `/api/rewards` 也可幂等补偿，不以浏览器在线为自动运行前提。

验证新增迁移后，检查构建输出与Cloudflare Cron配置，再访问 `/rewards` 和 `/participation`。管理员到 `/admin/incentives` 导入名册、选择班委与录入活动。不要在生产环境用真实抽奖做测试，也不要把激活码、名册或答卷写入GitHub。
