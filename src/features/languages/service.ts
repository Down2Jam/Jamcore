import db from "../../infra/db.js";
import { BadRequestError } from "../../lib/errors.js";

export const supportedLocales = [
  "en", "fr", "it", "de", "es", "tr", "tl", "ru", "ja", "tok", "pt-br",
  "mis-edikan", "mis-meow",
];

export async function listLanguageUsage(tenantId?: string | null) {
  const rows = await db.user.groupBy({
    by: ["locale"],
    where: { tenantId: tenantId ?? null, locale: { not: null } },
    _count: { _all: true },
  });
  const counts = new Map(rows.map((row) => [row.locale, row._count._all]));
  return supportedLocales.map((key) => ({ key, usageCount: counts.get(key) ?? 0 }));
}

export async function setUserLanguage(userId: number, locale: string) {
  const key = locale.toLowerCase();
  if (!supportedLocales.includes(key)) throw new BadRequestError("Unknown language.");
  await db.user.update({ where: { id: userId }, data: { locale: key } });
  return { locale: key };
}
