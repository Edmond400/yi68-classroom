# 艺68班级服务站

班务、通知、课表、问卷、参与激励、公共相册、图片压缩包导出、点歌、才艺报名，以及色彩和素描作业上交进度。

这是 2026-11-24 整理的开源源码版本，采用 [MIT 许可证](LICENSE)。

## 本地运行

使用 Node.js 24 和 pnpm 11.25.0。

```sh
git clone https://github.com/Edmond400/yi68-classroom.git
cd yi68-classroom
pnpm install --frozen-lockfile
python -m pip install python-pptx==1.0.2
pnpm check
pnpm test
pnpm build
pnpm dev
```

测试只使用本地生成的数据。Cloudflare 项目首次运行前需应用本地数据库迁移：`pnpm db:migrate:local`。

## 部署与数据

部署步骤见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。请创建自己的 Worker、D1 和需要的 R2 桶，并替换配置中的示例标识。仓库不提供有效密码、生产数据库、同学名单、财务记录、录音或用户上传的照片。

饮品问卷中的定向分支使用虚构姓名“示例甲、示例乙、示例丙”，可按自己的活动修改。菜单图片也为占位图。



## 版本来源

本次快照的源提交：`453e314fb5a20eba8599ac097664b806d71508f4`。公开仓库保留经过脱敏的功能代码与必要测试；生产运行记录与私有提交历史未纳入快照。公开源码和在线服务分别维护，后续版本需再次同步。

## 许可

原创代码使用 MIT。第三方依赖、字体和图片的许可独立适用；MIT 不授予大学名称、徽标、商标或站内用户内容的使用权。问题反馈请使用本仓库 Issues，勿附带密码、令牌或原始个人数据。
