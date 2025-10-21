// scripts/fix-links.js
import fs from 'fs';
import path from 'path';

const root = 'build';

/** Recursively list all files */
function walk(dir: string): string[] {
	const out: string[] = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out;
}

/** Build a URL -> filePath map for every emitted HTML page */
function buildUrlMap() {
	const map = new Map();

	map.set('/', path.join(root, '/index.html'));
	for (const file of walk(root)) {
		const rel = path.relative(root, file).replace(/\\/g, '/');
		const url = '/' + rel;

		map.set(url, file);

		// Special handling for pages
		if (rel.endsWith('/index.html')) {
			const base = '/' + rel.slice(0, -'index.html'.length);
			map.set(base, file);
			map.set(base.slice(0, -1), file);
		} else if (rel.endsWith('.html')) {
			const base = '/' + rel.slice(0, -'.html'.length);
			map.set(base, file);
			map.set(base + '/', file);
		}
	}

	return map;
}

/** Given current HTML file and an absolute href like '/foo/', return a proper relative link */
function resolveRelative(fromFile: string, absHref: string, urlMap: Map<string, string>) {
	if (!absHref.startsWith('/') || /^https?:\/\//i.test(absHref)) return null;

	const target = urlMap.get(absHref);
	if (!target) {
		console.warn(`[relativize] Unresolved: ${absHref} (from ${fromFile})`);
		return null;
	}

	const rel = path.relative(path.dirname(fromFile), target).replace(/\\/g, '/');
	return rel.startsWith('.') ? rel : './' + rel;
}

function processHtml(filePath: string, urlMap: Map<string, string>) {
	let html = fs.readFileSync(filePath, 'utf8');

	html = html.replace(/(href|src)="([^"]+)"/g, (m, attr, val) => {
		const rel = resolveRelative(filePath, val, urlMap);
		return rel ? `${attr}="${rel}"` : m;
	});

	fs.writeFileSync(filePath, html);
}

function main() {
	console.log('Relativizing HTML links for file:// navigation…');
	const urlMap = buildUrlMap();
	for (const f of walk(root)) {
		if (f.endsWith('.html')) processHtml(f, urlMap);
	}
}

main();