import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import logger from "@helper/logger";
import db from "@helper/db";
import { readdir, readFile } from "fs/promises";
import path from "path";
import chroma from "chroma-js";

const router = Router();

type RawTheme = {
  name: string;
  type: string;
  extends?: string;
  colors: Record<string, string>;
};

function resolveColor(value: string, merged: Record<string, string>): string {
  const steps = value.split(">").map((s) => s.trim());
  let base = steps.shift()!;

  if (base.startsWith("@")) {
    const ref = base.slice(1);
    base = merged[ref] || "#000000";
  }

  let color = chroma.valid(base) ? chroma(base) : chroma("#000000");
  for (const step of steps) {
    if (step === "darken") color = color.darken();
    else if (step === "lighten") color = color.brighten();
  }

  return color.hex();
}

function collectThemeChain(
  themeName: string,
  allThemes: Record<string, RawTheme>
): RawTheme[] {
  const chain: RawTheme[] = [];
  const visited = new Set<string>();
  let current: string | undefined = themeName;

  while (current) {
    if (visited.has(current)) throw new Error(`Circular extends: ${current}`);
    visited.add(current);

    const theme = allThemes[current];
    if (!theme) throw new Error(`Theme not found: ${current}`);
    chain.unshift(theme); // Base first
    current = theme.extends;
  }

  return chain;
}

function resolveTheme(
  themeName: string,
  allThemes: Record<string, RawTheme>
): Record<string, string> {
  const themeChain = collectThemeChain(themeName, allThemes);

  const merged: Record<string, string> = {};
  const refs: Record<string, string> = {};

  // 1. First collect all non-@ values
  for (const theme of themeChain) {
    for (const [key, value] of Object.entries(theme.colors)) {
      if (value.startsWith("@")) {
        refs[key] = value; // may be overwritten later
      } else {
        merged[key] = value; // newer themes overwrite
      }
    }
  }

  // 2. Now resolve @ references
  for (const [key, value] of Object.entries(refs)) {
    merged[key] = resolveColor(value, merged);
  }

  return merged;
}

/**
 * Route to set the site themes
 */
router.get("/", rateLimit(), async (_req, res) => {
  try {
    const dir = path.join(process.cwd(), "public", "site-themes");
    const files = await readdir(dir);
    const allThemes: Record<string, RawTheme> = {};

    for (const file of files) {
      const raw = await readFile(path.join(dir, file), "utf8");
      const theme = JSON.parse(raw);
      allThemes[theme.name] = theme;
    }

    const result = Object.entries(allThemes).map(([name, rawTheme]) => {
      const resolvedColors = resolveTheme(name, allThemes);
      return {
        ...rawTheme,
        colors: resolvedColors,
      };
    });

    res.send({ message: "Themes fetched", data: result });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to load themes" });
  }
});

export default router;
