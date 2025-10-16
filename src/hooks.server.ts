import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { minify } from 'html-minifier-terser';
import beautify from 'js-beautify';
import { sequence } from '@sveltejs/kit/hooks';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});


export async function handlePretty({ event, resolve }) {
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			process.env.NODE_ENV === 'development'
				? beautify.html(html, { indent_size: 2 })
				: minify(html, { collapseWhitespace: true }),
	});

	return response;
}

export const handle: Handle = sequence(handleParaglide, handlePretty);
