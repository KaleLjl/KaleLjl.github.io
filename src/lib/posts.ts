import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

// 本地 dev 显示草稿，构建时过滤掉
const INCLUDE_DRAFTS = import.meta.env.DEV;

/** 全部文章，按发布日期倒序 */
export async function getPosts(): Promise<Post[]> {
	const posts = await getCollection('posts', ({ data }) => INCLUDE_DRAFTS || !data.draft);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postPath(post: Post): string {
	return `/posts/${post.id}/`;
}

/** 中文按 ~350 字/分钟，英文按 ~200 词/分钟估算 */
export function readingTime(body: string | undefined): number {
	if (!body) return 1;
	const cjk = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length;
	const words = body
		.replace(/[\u4e00-\u9fa5]/g, ' ')
		.replace(/```[\s\S]*?```/g, ' ')
		.split(/\s+/)
		.filter(Boolean).length;
	return Math.max(1, Math.round(cjk / 350 + words / 200));
}

/** 标签 -> 文章列表，按文章数倒序 */
export async function getTags(): Promise<{ tag: string; count: number }[]> {
	const posts = await getPosts();
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.data.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** 标签在 URL 里的形式 */
export function tagSlug(tag: string): string {
	return tag.toLowerCase().replace(/\s+/g, '-');
}
