/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { Database } from "duckdb";

// Fail hard on unhandled rejections
process.on("unhandledRejection", (e) => { console.error(e); process.exit(1); });

async function main() {
  const dbPath = path.resolve("data/dbprove.duckdb");
  const outDirData = path.resolve("data");
  const outDirStatic = path.resolve("static", "data");

  fs.mkdirSync(outDirData, { recursive: true });
  fs.mkdirSync(outDirStatic, { recursive: true });

  const db = new Database(dbPath, { read_only: false });
  const conn = db.connect();

  try {
    // 2) Any setup DDL/DML you need before extracting
    // Example: create schema/table or refresh materialized views
    conn.run(`
      PRAGMA threads=4;
      CREATE SCHEMA IF NOT EXISTS staging;
    `);

    console.log(`Staging created`);
  } finally {
    conn.close();
    db.close();
  }
}

main();
