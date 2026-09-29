#!/usr/bin/env node
// Applies migrations/*.sql (in filename order) to the Turso database.
// Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from the environment, falling back to ./.dev.vars.
// Applied files are recorded in `_migrations` so re-running is safe.
//
//   npm run db:migrate
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:migrate

import { createClient } from "@libsql/client";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(apiDir, "migrations");

try {
  process.loadEnvFile(path.join(apiDir, ".dev.vars")); // env vars already set take precedence
} catch {
  // no .dev.vars - rely on the environment
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
if (!url) {
  console.error("TURSO_DATABASE_URL is not set (export it or put it in .dev.vars).");
  process.exit(1);
}

const db = createClient({ url, authToken });

await db.execute(
  "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
);
const applied = new Set((await db.execute("SELECT name FROM _migrations")).rows.map((r) => String(r.name)));

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
let count = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`skip    ${file} (already applied)`);
    continue;
  }
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  await db.executeMultiple(sql);
  await db.execute({
    sql: "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
    args: [file, new Date().toISOString()],
  });
  console.log(`applied ${file}`);
  count++;
}
console.log(count ? `Done - ${count} migration(s) applied.` : "Done - database is up to date.");
