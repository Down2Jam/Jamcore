import chroma from "chroma-js";
import { readdir, readFile } from "fs/promises";
import path from "path";

export type RawSiteTheme = {
  name: string;
  type: string;
  extends?: string;
  colors: Record<string, string>;
};

function resolveColor(value: string, merged: Record<string, string>): string {
  const steps = value.split(">").map((step) => step.trim());
  let base = steps.shift() ?? "#000000";

  if (base.startsWith("@")) {
    base = merged[base.slice(1)] || "#000000";
  }

  let color = chroma.valid(base) ? chroma(base) : chroma("#000000");
  for (const step of steps) {
    if (step === "darken") {
      color = color.darken();
    } else if (step === "lighten") {
      color = color.brighten();
    }
  }

  return color.hex();
}

function collectThemeChain(
  themeName: string,
  allThemes: Record<string, RawSiteTheme>,
): RawSiteTheme[] {
  const chain: RawSiteTheme[] = [];
  const visited = new Set<string>();
  let current: string | undefined = themeName;

  while (current) {
    if (visited.has(current)) {
      throw new Error(`Circular extends: ${current}`);
    }
    visited.add(current);

    const theme: RawSiteTheme | undefined = allThemes[current];
    if (!theme) {
      throw new Error(`Theme not found: ${current}`);
    }
    chain.unshift(theme);
    current = theme.extends;
  }

  return chain;
}

function resolveTheme(
  themeName: string,
  allThemes: Record<string, RawSiteTheme>,
): Record<string, string> {
  const themeChain = collectThemeChain(themeName, allThemes);
  const merged: Record<string, string> = {};
  const refs: Record<string, string> = {};

  for (const theme of themeChain) {
    for (const [key, value] of Object.entries(theme.colors)) {
      if (value.startsWith("@")) {
        refs[key] = value;
      } else {
        merged[key] = value;
      }
    }
  }

  for (const [key, value] of Object.entries(refs)) {
    merged[key] = resolveColor(value, merged);
  }

  return merged;
}

export async function listSiteThemes() {
  const dir = path.join(process.cwd(), "public", "site-themes");
  const files = await readdir(dir);
  const allThemes: Record<string, RawSiteTheme> = {};

  for (const file of files) {
    const raw = await readFile(path.join(dir, file), "utf8");
    const theme: RawSiteTheme = JSON.parse(raw);
    allThemes[theme.name] = theme;
  }

  return Object.entries(allThemes).map(([name, rawTheme]) => ({
    ...rawTheme,
    colors: resolveTheme(name, allThemes),
  }));
}
