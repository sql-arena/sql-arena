import { fetchBlogTitle, loadMarkdown } from '$lib/db';

export const load = async ({params}) => {
	const blog = await loadMarkdown(params.slug, true)
	const title = await fetchBlogTitle(params.slug);
	return { blog, title: title };
};
