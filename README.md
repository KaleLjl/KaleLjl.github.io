# 个人博客

基于 [Astro](https://astro.build) 的静态博客，部署在 GitHub Pages。

## 本地开发

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # 输出到 dist/
npm run preview    # 预览构建结果
```

## 写新文章

在 `src/content/posts/` 新建 `.md` 文件，frontmatter 格式见
[`src/content/posts/writing-guide.md`](src/content/posts/writing-guide.md)。

## 目录结构

```
src/
├── consts.ts              # 站点标题、导航、社交链接
├── content.config.ts      # 文章 frontmatter 校验
├── content/posts/         # 文章（你只需要动这里）
├── components/            # 头部、页脚、文章卡片等
├── layouts/BaseLayout.astro
├── lib/posts.ts           # 取文章、阅读时长
├── pages/
│   ├── index.astro        # 首页
│   ├── posts/             # 文章列表 + 详情
│   ├── about.astro
│   └── rss.xml.js
└── styles/global.css      # 设计变量与排版
```

## 换配色 / 换字体

改 `src/styles/global.css` 顶部的 CSS 变量即可，深色模式在
`html[data-theme='dark']` 里。

## 部署

推送到 `main` 分支后，`.github/workflows/deploy.yml` 会自动构建并发布到
GitHub Pages。首次部署需要在仓库 **Settings → Pages → Source** 里选择
**GitHub Actions**。

## 换到自定义域名

1. 在 `public/` 下新建 `CNAME` 文件，内容写你的域名（如 `blog.example.com`）
2. DNS 加一条 `CNAME` 记录指向 `kalleljl.github.io`
3. 仓库 Settings → Pages 勾选 **Enforce HTTPS**
4. 把 `astro.config.mjs` 的 `site` 改成新域名
