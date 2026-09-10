import "dotenv/config";
import { defineConfig, env } from "prisma/config";

function resolveDatabaseUrl() {
  return env("DATABASE_URL").replace(
    /\$\{(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB)\}/g,
    (_placeholder, variable: string) =>
      encodeURIComponent(env(variable)),
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
