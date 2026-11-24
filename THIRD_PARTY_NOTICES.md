# 第三方许可与标识

本项目原创代码以根目录 `LICENSE` 中的 MIT 许可证发布。

- `build/sites-vite-plugin.ts` 的许可见相邻的 `build/sites-vite-plugin.LICENSE`。
- `vendor/shadcn-tailwind-4.13.0.css` 的许可见相邻的 `vendor/shadcn-tailwind-4.13.0.LICENSE.md`。
- 通过包管理器安装的依赖各自遵循其发布包中的许可证；依赖列表与锁定版本见 `package.json`、`pnpm-lock.yaml`。
- 许可证不授予清华大学、清华大学美术学院等机构名称、徽标或商标的使用权，也不表示这些机构为衍生项目背书。部署自己的站点时请替换班级名称与品牌图像。

线上网站中的答卷、账号、班务记录、附件及私有备份不属于本源码发布内容。

## PDF reading-script export

- pdf-lib 1.17.1 and @pdf-lib/fontkit 1.1.1, MIT licenses (distributed in the packages).
- Noto Sans SC, copyright Adobe and Google contributors, SIL Open Font License 1.1. Source: https://github.com/google/fonts/tree/main/ofl/notosanssc . The bundled gzip-compressed static regular TTF is derived from the variable font at weight 400, with hinting and optional layout features removed; original Unicode coverage is retained. The PDF embeds the full static font to preserve composite CJK outlines reliably. License: `public/fonts/OFL.txt`.

- PDF.js 5.4.624 worker, Apache License 2.0, copied from the pinned `pdfjs-dist` package to `public/vendor/pdf.worker-5.4.624.min.mjs` so worker code is served without development-page transforms.
