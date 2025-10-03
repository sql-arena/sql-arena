import path from 'path';
import { fileURLToPath } from 'url';

// Absolute path to the project root (repo root)
export const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',   // from src/lib → src
	'..'    // from src → repo root
);

export const databasePath = path.join(repoRoot, 'data', 'dbprove.duckdb');
