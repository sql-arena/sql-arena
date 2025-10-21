import path from 'path';
import { fileURLToPath } from 'url';
import { findUpSync } from 'find-up';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = findUpSync('package.json', { cwd: currentDir });

if (!packageJsonPath) {
	throw new Error('Could not find project root (package.json not found)');
}

// Absolute path to the project root (repo root)
export const repoRoot = path.dirname(packageJsonPath);

export const databasePath = path.join(repoRoot, 'data', 'dbprove.duckdb');
