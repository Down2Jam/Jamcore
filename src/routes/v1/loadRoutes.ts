import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Router } from "express";

import logger from "../../infra/logger.js";

type HttpMethod = "get" | "post" | "put" | "delete";

const HTTP_METHODS = new Set<HttpMethod>(["get", "post", "put", "delete"]);

function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.has(value as HttpMethod);
}

export async function loadRoutes(router: Router, dir: string, routePath = "") {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await loadRoutes(router, filePath, `${routePath}/${entry.name}`);
      continue;
    }

    const extension = path.extname(entry.name);
    const basename = path.basename(entry.name, extension);

    if (basename === "v1" || basename === "index") {
      continue;
    }

    if (![".ts", ".js"].includes(extension)) {
      continue;
    }

    const method = basename.toLowerCase();
    if (!isHttpMethod(method)) {
      logger.debug(
        `Skipping ${path.join(routePath, entry.name)} because ${basename} is not a supported HTTP method.`,
      );
      continue;
    }

    const module = await import(pathToFileURL(filePath).href);
    if (!module.default) {
      logger.debug(
        `Skipping ${path.join(routePath, entry.name)} because it has no default export.`,
      );
      continue;
    }

    router.use(routePath, module.default);
    logger.debug(`Loaded route: ${path.join(routePath, entry.name)}`);
  }
}
