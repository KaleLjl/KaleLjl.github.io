import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
	loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			// 建议用英文短标签，会直接出现在 URL 里
			tags: z.array(z.string()).default([]),
			// true 时只有本地 dev 能看到，构建产物里不会出现
			draft: z.boolean().default(false),
			heroImage: image().optional(),
		}),
});

export const collections = { posts };
