import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(["features", "infra", "loaders", "lib", "middleware", "guards", "types"].map(name =>
      [`@${name}`, fileURLToPath(new URL(`./src/${name}`, import.meta.url))],
    )),
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
