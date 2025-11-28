import { fetchBlogTitle, loadMarkdown } from '$lib/db';

export const load = async ({params}) => {
	const blog = await loadMarkdown(params.slug, true)
	const title = await fetchBlogTitle(params.slug);

	const plainText = (html: string) =>
		html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

	const description = plainText(blog).slice(0, 200);
	const url = typeof document !== 'undefined' ? window.location.href : '';

	return { blog, url: url, meta : {title: title, description: description }};
};
