import fs from "node:fs/promises";
import path from "node:path";

const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
const allowlistPath = path.resolve(
  process.cwd(),
  "docs",
  "migration-safety-allowlist.json",
);
const entries = await fs.readdir(migrationsDir, { withFileTypes: true }).catch(() => []);
const allowlist = JSON.parse(
  await fs.readFile(allowlistPath, "utf8").catch(() => "[]"),
);

const flagged = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const migrationPath = path.join(migrationsDir, entry.name, "migration.sql");
  const raw = await fs.readFile(migrationPath, "utf8").catch(() => "");
  if (allowlist.includes(entry.name)) {
    continue;
  }
  if (/\bDROP\s+TABLE\b/i.test(raw) || /\bTRUNCATE\b/i.test(raw)) {
    flagged.push({ migration: entry.name, reason: "destructive statement detected" });
  }
}

if (flagged.length > 0) {
  console.error(JSON.stringify({ ok: false, flagged }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: entries.length }, null, 2));
