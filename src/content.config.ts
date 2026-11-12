import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
	loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			// 可省略：省略时标题 = 文件名（slug 化后）
			title: z.string().optional(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			// true 时只有本地 dev 能看到，构建产物里不会出现
			draft: z.boolean().default(false),
			heroImage: image().optional(),
			// 可选：覆盖 URL slug（否则用文件名）
			slug: z.string().optional(),
		}),
});

export const collections = { posts };
