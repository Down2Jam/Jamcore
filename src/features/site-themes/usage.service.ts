import db from "../../infra/db.js";
import { BadRequestError } from "../../lib/errors.js";
import { listSiteThemes } from "./service.js";

export async function listSiteThemesWithUsage(tenantId?: string | null) {
  const [themes, usageRows] = await Promise.all([
    listSiteThemes(),
    db.user.groupBy({
      by: ["siteTheme"],
      where: {
        tenantId: tenantId ?? null,
        siteTheme: { not: null },
      },
      _count: { _all: true },
    }),
  ]);
  const usageByTheme = new Map(
    usageRows.map((row) => [
      row.siteTheme?.toLowerCase(),
      row._count._all,
    ]),
  );

  return themes.map((theme) => ({
    ...theme,
    usageCount: usageByTheme.get(theme.name.toLowerCase()) ?? 0,
  }));
}

export async function setUserSiteTheme(userId: number, themeName: string) {
  const themes = await listSiteThemes();
  const theme = themes.find(
    (candidate) => candidate.name.toLowerCase() === themeName.toLowerCase(),
  );

  if (!theme || theme.hidden) {
    throw new BadRequestError("Unknown site theme.");
  }

  await db.user.update({
    where: { id: userId },
    data: { siteTheme: theme.name },
  });

  return { siteTheme: theme.name };
}
