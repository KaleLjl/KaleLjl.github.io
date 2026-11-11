import rss from '@astrojs/rss';
import { getPosts } from '../lib/posts';
import { SITE_TITLE, SITE_DESCRIPTION, SITE_AUTHOR } from '../consts';

export async function GET(context) {
	const posts = await getPosts();

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			link: `/posts/${post.id}/`,
			author: SITE_AUTHOR,
		})),
		customData: `<language>zh-cn</language>`,
	});
}
