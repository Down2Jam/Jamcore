import express from "express";

import { readdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import games from "./games/index.js";
import themes from "./themes/index.js";

var router = express.Router();

function loadRoutes(dir: string, routePath: string) {
  const files = readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);

    if (file.isDirectory()) {
      loadRoutes(filePath, routePath + "/" + file.name);
    } else {
      const extension = path.extname(file.name);
      const basename = path.basename(file.name, extension);

      if (basename === "v1" || basename === "index") {
        continue;
      }

      if (![".ts", ".js"].includes(extension)) {
        continue;
      }

      import(pathToFileURL(filePath).href).then(
        (module) => {
          if (!module.default) {
            console.log(
              `Route ${path.join(routePath, file.name)} has no default export`
            );
            return;
          }

          const method = basename.toLowerCase();

          if (!["get", "post", "put", "delete"].includes(method)) {
            console.log(
              `Route ${path.join(
                routePath,
                file.name
              )} is not a rest api method`
            );
            return;
          }

          router.use(routePath, module.default);
          console.log(`Loaded route: ${path.join(routePath, file.name)}`);
        }
      );
    }
  }
}

router.use("/games", games);
router.use("/themes", themes);

loadRoutes(__dirname, "");

export default router;
