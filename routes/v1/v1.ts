import express from "express";

import { readdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import games from "./games/index.js";
import themes from "./themes/index.js";
import documentationDocumentGet from "./documentation-document/get.js";
import documentationDocumentPost from "./documentation-document/post.js";
import documentationDocumentPut from "./documentation-document/put.js";
import documentationDocumentDelete from "./documentation-document/delete.js";
import documentationDocumentsGet from "./documentation-documents/get.js";
import pressKitMediaGet from "./press-kit-media/get.js";
import pressKitMediaPost from "./press-kit-media/post.js";
import pressKitMediaDelete from "./press-kit-media/delete.js";

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
router.use("/documentation-document", documentationDocumentGet);
router.use("/documentation-document", documentationDocumentPost);
router.use("/documentation-document", documentationDocumentPut);
router.use("/documentation-document", documentationDocumentDelete);
router.use("/documentation-documents", documentationDocumentsGet);
router.use("/press-kit-media", pressKitMediaGet);
router.use("/press-kit-media", pressKitMediaPost);
router.use("/press-kit-media", pressKitMediaDelete);

loadRoutes(__dirname, "");

export default router;
