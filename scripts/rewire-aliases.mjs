import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distRoot = path.resolve(__dirname, "..", "dist");

const aliasTargets = {
  "@helper/": path.join(distRoot, "helper"),
  "@middleware/": path.join(distRoot, "middleware"),
  "services/": path.join(distRoot, "services"),
};

async function collectJsFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectJsFiles(fullPath);
      }
      return fullPath.endsWith(".js") ? [fullPath] : [];
    }),
  );
  return files.flat();
}

function toImportPath(fromFile, targetFile) {
  const relativePath = path.relative(path.dirname(fromFile), targetFile);
  return relativePath.split(path.sep).join("/").replace(/^([^./])/, "./$1");
}

function rewriteAliasSpecifiers(filePath, source) {
  let nextSource = source;

  for (const [aliasPrefix, targetRoot] of Object.entries(aliasTargets)) {
    const escaped = aliasPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(["'])${escaped}([^"']+)\\1`, "g");

    nextSource = nextSource.replace(pattern, (_match, quote, subpath) => {
      const targetFile = path.join(targetRoot, `${subpath}.js`);
      return `${quote}${toImportPath(filePath, targetFile)}${quote}`;
    });
  }

  nextSource = nextSource.replace(
    /(["'])((?:\.\.?\/)[^"']+)\1/g,
    (_match, quote, specifier) => {
      if (
        specifier.endsWith(".js") ||
        specifier.endsWith(".json") ||
        specifier.endsWith(".mjs")
      ) {
        return `${quote}${specifier}${quote}`;
      }

      return `${quote}${specifier}.js${quote}`;
    },
  );

  return nextSource;
}

async function main() {
  const files = await collectJsFiles(distRoot);

  await Promise.all(
    files.map(async (filePath) => {
      const source = await fs.readFile(filePath, "utf8");
      const rewritten = rewriteAliasSpecifiers(filePath, source);
      if (rewritten !== source) {
        await fs.writeFile(filePath, rewritten, "utf8");
      }
    }),
  );
}

main().catch((error) => {
  console.error("Failed to rewrite dist aliases:", error);
  process.exitCode = 1;
});
