import { readdir } from "node:fs/promises";
import { db } from "./db";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);

await db`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
const applied = new Set((await db`SELECT name FROM schema_migrations`).map((row) => row.name));

for (const file of files) {
  if (applied.has(file)) continue;

  const sql = await Bun.file(new URL(file, MIGRATIONS_DIR)).text();
  console.log(`Applying ${file}...`);
  await db.begin(async (tx) => {
    await tx.unsafe(sql);
    await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
  });
}

console.log("Migrations up to date.");
await db.close();
