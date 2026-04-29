import fs from "node:fs";
import path from "node:path";

const registry = JSON.parse(
  await fs.promises.readFile(
    path.resolve(process.cwd(), "contracts", "api-registry.json"),
    "utf8",
  ),
);

const errors = [];
const seen = new Set();

for (const route of registry.routes) {
  const key = `${route.method} ${route.path}`;
  if (seen.has(key)) {
    errors.push(`Duplicate route in API registry: ${key}`);
  }
  seen.add(key);

  if (!route.auth?.kind) {
    errors.push(`Route missing explicit auth metadata: ${key}`);
  }
  if (!route.visibility) {
    errors.push(`Route missing docs visibility metadata: ${key}`);
  }
  if (!route.rateLimit?.headers) {
    errors.push(`Route missing rate-limit header metadata: ${key}`);
  }
  if (["POST", "PUT", "DELETE"].includes(route.method) && !route.idempotency?.supported) {
    errors.push(`Mutation route missing idempotency metadata: ${key}`);
  }
  for (const parameter of route.parameters ?? []) {
    if (!parameter.name || !parameter.in || !parameter.schema) {
      errors.push(`Route has incomplete parameter metadata: ${key}`);
    }
  }
}

const publicRoutes = registry.routes.filter((route) => route.visibility === "public");
if (!publicRoutes.some((route) => route.path === "/capabilities")) {
  errors.push("Public capabilities route is missing from API registry");
}

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  routes: registry.routes.length,
  publicRoutes: publicRoutes.length,
}, null, 2));
