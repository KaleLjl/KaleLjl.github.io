---
title: 写作指南：这个博客怎么加文章
description: frontmatter 字段说明、Markdown 语法示例，以及发布流程。既是备忘也是排版测试页。
pubDate: 2026-11-10
---

这篇文章既是对自己的备忘，也顺便测试一下各种 Markdown 元素在站内的渲染效果。

## 新增一篇文章

在 `src/content/posts/` 下新建一个 `.md` 文件，文件名就是 URL 的一部分：

```
src/content/posts/my-first-post.md  →  /posts/my-first-post/
```

### frontmatter 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 标题 |
| `description` | 是 | 摘要，用于列表页、SEO、RSS |
| `pubDate` | 是 | 发布日期，`YYYY-MM-DD` |
| `updatedDate` | 否 | 更新日期，会在文首显示「更新于」 |
| `draft` | 否 | `true` 时只在本地 dev 可见 |

一个完整的开头长这样：

```yaml
---
title: 文章标题
description: 一句话摘要
pubDate: 2026-11-10
updatedDate: 2026-11-12
draft: false
---
```

## 发布流程

```bash
npm run dev      # 本地预览 http://localhost:4321
git add -A
git commit -m "post: 新文章"
git push         # 推送后 GitHub Actions 自动构建并上线
```

## 排版示例

### 行内元素与引用

普通文字、**加粗**、*斜体*、~~删除线~~、`行内代码`，以及[链接](https://astro.build)。

> 引用块适合放原文摘录或强调。
>
> 多段引用也可以。

### 列表

- 无序列表项
- 第二项
  - 嵌套一层
  - 再来一个

1. 有序列表
2. 第二步
3. 第三步

### 代码块

```ts
type Post = {
	title: string;
	description: string;
};

export function slugify(input: string): string {
	return input.toLowerCase().replace(/\s+/g, '-');
}
```

### 分隔线

---

内容到这里结束。
