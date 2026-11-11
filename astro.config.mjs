// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// 部署在 GitHub Pages 的根路径（仓库名 = kalleljl.github.io）
	// 如果以后换成 user.github.io/blog 这种子路径仓库，这里要加 base: '/blog'
	site: 'https://kalleljl.github.io',

	integrations: [mdx(), sitemap()],

	markdown: {
		shikiConfig: {
			// 亮/暗双主题，靠 CSS 变量切换，不用重新构建
			themes: {
				light: 'github-light',
				dark: 'github-dark-dimmed',
			},
			defaultColor: false,
			wrap: false,
		},
	},
});
