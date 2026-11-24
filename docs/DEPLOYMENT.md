# 独立部署

1. 登录自己的 Cloudflare 账号，创建独立 Worker 和 D1 数据库，将返回的 UUID 填入 wrangler 配置的 `database_id`；仓库中的 UUID 是占位符。
2. 在自己的 Cloudflare 账号配置加密秘密，不要将真实值提交到 Git。
3. 应用迁移、构建并部署；域名路由请按自己的域名配置。首次使用先在本地或测试环境核对。

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create NAME
# 将返回的 UUID 填入 wrangler.json，按其 binding 创建自己的 R2 桶。
pnpm exec wrangler d1 migrations apply DB --remote
pnpm build
pnpm exec wrangler deploy
```

Node.js 24，pnpm 11.25.0。部署前设置所需的加密秘密，确保上传文件的桶不对外公开。不要把示例 UUID 当作可用资源；不要复制他人的生产配置。

管理员通过 ADMIN_BOOTSTRAP_TOKEN_HASH 初始化：自行生成至少 32 字符的私密码，将 SHA-256 摘要用 `pnpm exec wrangler secret put ADMIN_BOOTSTRAP_TOKEN_HASH` 保存，在 /admin/login 输入原码并设置密码。CLASS_ROSTER_JSON 通过 Worker secret 配置，只填写你有权管理的名单。R2 绑定名为 FAVORITE_CHARACTER_MEDIA。
