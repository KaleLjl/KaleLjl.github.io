# 项目约定（给 AI / 未来的自己）

这是一个 Astro 7 静态博客，部署在 GitHub Pages（仓库名 `KaleLjl.github.io`，根路径）。

## 加文章

在 `src/content/posts/` 新建 `.md`，文件名即 URL slug（用英文短横线）：

```yaml
---
title: 标题
description: 一句话摘要（用于列表页、SEO、RSS）
pubDate: 2026-11-11
draft: false
---
```

- `draft: true` → 只在 `npm run dev` 出现，不进构建产物
- 没有标签系统，不要再加回来
- 需要图片就用 `heroImage`（放 `src/assets/`）或 Markdown 内联图片

## 代码结构

- `src/consts.ts` — 站点标题、描述、导航、社交链接
- `src/lib/posts.ts` — 取文章 / 阅读时长的唯一入口
- `src/styles/global.css` — 全部设计变量与正文排版（`--accent` 等）
- `src/layouts/BaseLayout.astro` — 页面骨架，props: title/description/type/wide
- 深色模式：`html[data-theme]` + CSS 变量，脚本内联在 `BaseHead` / `Header`

## 规则

- 不做客户端 hydration，除非确有交互需求（当前整站只有主题切换一个内联脚本）
- 新增页面放在 `src/pages/`，沿用 `BaseLayout`
- 改动后跑 `npm run check && npm run build`
- 不要提交 `dist/`、`.astro/`、`node_modules/`

## 部署

push 到 `main` → `.github/workflows/deploy.yml` 自动构建发布。
仓库 Settings → Pages → Source 必须是 **GitHub Actions**。
换域名：`public/CNAME` + `astro.config.mjs` 的 `site`。
