import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin } from 'vite';


function duckdbCleanup(): Plugin {
	return {
		name: 'duckdb-cleanup',
		apply: 'build',
		closeBundle: {
			sequential: true,
			async handler() {
				/*
					const { closeDb } = await import('./src/lib/db.js');
					closeDb();

				 */
			}
		}
	}
}

function handleNodeFiles(): Plugin {
	return {
		name: 'handle-node-files',
		resolveId(id) {
			// Mark .node files and DuckDB packages as external
			if (id.endsWith('.node') ||
				id.includes('duckdb') ||
				id.includes('@duckdb') ||
				id === 'find-up' ||
				id === 'locate-path' ||
				id === 'p-locate' ||
				id === 'path-exists') {
				return { id, external: true };
			}
			return null;
		}
	};
}

export default defineConfig({
	plugins: [
		handleNodeFiles(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		}),
		duckdbCleanup()
	],
	assetsInclude: ['**/*.sql'],
	ssr: {
		external: [
			'duckdb',
			'@duckdb/node-api',
			'@duckdb/node-bindings-win32-x64',
			'@duckdb/node-bindings-darwin-arm64',
			'@duckdb/node-bindings-darwin-x64',
			'@duckdb/node-bindings-linux-x64',
			'find-up',
			'locate-path',
			'p-locate',
			'fileURLToPath',
			'findUpSync',
			'path-exists'
		],
		noExternal: []
	},
	optimizeDeps: {
		exclude: ['duckdb', '@duckdb/node-api', 'find-up', 'unicorn-magic']
	},
	build: {
		rollupOptions: {
			external: [
				'duckdb',
				'@duckdb/node-api',
				/^@duckdb\/node-bindings-.*/,
				/\.node$/,
				'find-up',
				'locate-path',
				'p-locate',
				'fileURLToPath',
				'findUpSync',
				'path-exists'
			]
		}
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					environment: 'browser',
					browser: {
						enabled: true,
						provider: 'playwright',
						instances: [{ browser: 'chromium' }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
