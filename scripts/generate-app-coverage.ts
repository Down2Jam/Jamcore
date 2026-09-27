import { writeFileSync } from "node:fs";
import registry from "../src/contracts/api-registry.json";
import { requiredAppScope } from "../src/auth/appScopes.js";

const lines = [
  "# App API coverage", "",
  "Generated from the API registry and app scope policy with `npx tsx scripts/generate-app-coverage.ts`.", "",
  "Paths are relative to `/api/v1`. Public reads need no token; HEAD follows GET. Player progress lives under `/self` and requires authentication. Protocol endpoints retain their own credential requirements. See [app authorization](app-authorization.md) for setup.", "",
  "| Method | Route | Anonymous access | App scope |", "| --- | --- | --- | --- |",
];
for (const route of registry.routes) {
  const scope = requiredAppScope(route.path, route.method);
  const anonymous = route.visibility !== "public" ? "Internal" : route.auth.required ? "No" :
    route.method === "GET" ? (route.auth.optional ? "Public data only" : "Yes") : "Protocol / handler rules";
  lines.push(`| ${route.method} | \`${route.path}\` | ${anonymous} | ${scope ? `\`${scope}\`` : route.visibility !== "public" ? "Not delegated" : route.auth.required ? "Website only" : "Omit Authorization"} |`);
}
writeFileSync("docs/app-api-coverage.md", lines.join("\n") + "\n");
