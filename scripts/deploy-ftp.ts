import fs from "fs";
import path from "path";
import { Client } from "basic-ftp";
import AdmZip from "adm-zip";
import fetch from "node-fetch";

const FTP_USER = process.env.SQL_ARENA_FTP_USER!;
const FTP_PASS = process.env.SQL_ARENA_FTP_PWD!;
const HOST = "sql-arena.com";
const HOST_WWW ="www.sql-arena.com"
const REMOTE_DIR = "/";
const LOCAL_BUILD = "./build";
const ZIP_PATH = "./build.zip";

async function zipBuild() {
	console.log("📦 Creating build.zip...");
	const zip = new AdmZip();
	zip.addLocalFolder(LOCAL_BUILD);
	zip.writeZip(ZIP_PATH);
}

async function uploadAndUnpack() {
	console.log("📤 Uploading build.zip and deploy.php...");
	const client = new Client(60000);
	await client.access({
		host: HOST,
		port: 21,
		user: FTP_USER,
		password: FTP_PASS,
		secure: true,
		secureOptions: { rejectUnauthorized: false },
	});
	await client.ensureDir(REMOTE_DIR);
	await client.uploadFrom(ZIP_PATH, path.posix.join(REMOTE_DIR, "build.zip"));
	await client.uploadFrom("./scripts/deploy.php", path.posix.join(REMOTE_DIR, "deploy.php"));
	client.close();

	console.log("🚀 Triggering remote unzip...");
	const res = await fetch(`https://${HOST_WWW}/deploy.php`);
	const text = await res.text();
	console.log(text.trim());
}

async function main() {
	try {
		await zipBuild();
		await uploadAndUnpack();
		console.log("✅ Done");
	} catch (err) {
		console.error("❌ Deploy failed:", (err as Error).message);
		process.exit(1);
	} finally {
		if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
	}
}

main();
