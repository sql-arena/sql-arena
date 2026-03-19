import { loadMarkdown } from '$lib/db';

export const load = async ({params}) => {
	const { content, metadata } = await loadMarkdown(params.slug, true)
	const title = metadata.title || "Untitled Blog";

	const plainText = (html: string) =>
		html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

	const description = plainText(content).slice(0, 200);
	const url = typeof document !== 'undefined' ? window.location.href : '';

	return { blog: content, url: url, meta : {title: title, description: description }};
};
