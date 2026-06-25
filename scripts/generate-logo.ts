import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const logoDirectory = path.join(projectRoot, 'static', 'img', 'logo-dark');
const outputPath = path.join(projectRoot, 'src', 'lib', 'logo-dark-assets.ts');

function main() {
	const fileNames = fs
		.readdirSync(logoDirectory, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right));

	const entries = fileNames.map((fileName) => {
		const baseName = path.parse(fileName).name;
		return `\t${JSON.stringify(baseName)}: ${JSON.stringify(`/img/logo-dark/${fileName}`)}`;
	});

	const output = `const logoDarkAssetMap: Record<string, string> = {\n${entries.join(',\n')}\n};\n\nexport function getLogoDarkAsset(engineName: string): string {\n\treturn logoDarkAssetMap[engineName] ?? \`/img/logo-dark/\${engineName}.png\`;\n}\n`;

	fs.writeFileSync(outputPath, output);
	console.log(`Generated ${path.relative(projectRoot, outputPath)} from ${path.relative(projectRoot, logoDirectory)}`);
}

main();
