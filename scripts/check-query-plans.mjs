import fs from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(process.cwd(), "docs", "query-plans");
await fs.mkdir(outputDir, { recursive: true });

const snapshot = {
  generatedAt: new Date().toISOString(),
  notes: [
    "Add real EXPLAIN ANALYZE snapshots in environments with DATABASE_URL access.",
    "This placeholder ensures query-plan review is part of the delivery workflow.",
  ],
  hotRoutes: ["/api/v1/games", "/api/v1/search", "/api/v1/posts", "/api/v1/platform/events"],
};

await fs.writeFile(
  path.join(outputDir, "latest.json"),
  JSON.stringify(snapshot, null, 2),
  "utf8",
);

console.log(JSON.stringify({ ok: true, output: path.join(outputDir, "latest.json") }, null, 2));
