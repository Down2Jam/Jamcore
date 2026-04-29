import { Request, Response, NextFunction } from "express";
import { PageVersion } from "@prisma/client";

import db from "../infra/db.js";
import { doesCoreEntityBelongToTenant } from "../infra/coreTenantStore.js";
import { getCurrentActiveJam } from "@features/jams";
import { NotFoundError } from "../lib/errors.js";

async function getJam(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const implicitJamValue = req.body?.jam ?? req.query?.jam ?? req.params?.jam;
  const jamSlugValue =
    req.body?.jamSlug ??
    req.query?.jamSlug ??
    req.params?.jamSlug ??
    (typeof implicitJamValue === "string" && Number.isNaN(Number(implicitJamValue))
      ? implicitJamValue
      : undefined);
  const jamSlug =
    typeof jamSlugValue === "string" && jamSlugValue.trim().length > 0
      ? jamSlugValue.trim()
      : null;
  const jamIdValue =
    req.body?.jamId ??
    req.query?.jamId ??
    req.params?.jamId ??
    (typeof implicitJamValue === "string" && !Number.isNaN(Number(implicitJamValue))
      ? implicitJamValue
      : undefined);
  const jamId = typeof jamIdValue === "string" ? Number(jamIdValue) : jamIdValue;

  if (!jamSlug && !jamId) {
    const activeJam = await getCurrentActiveJam(res.locals.tenantId);

    if (!activeJam?.jam) {
      next(new NotFoundError("No active jams found."));
      return;
    }

    res.locals.jam = activeJam.jam as Record<string, unknown>;
    res.locals.nextJam = activeJam.nextJam ?? undefined;
    res.locals.jamPhase = activeJam.phase;
    next();
    return;
  }

  const jam = await db.jam.findFirst({
    where: jamSlug ? { slug: jamSlug } : { id: jamId },
    select: {
      id: true,
      name: true,
      slug: true,
      startTime: true,
      suggestionHours: true,
      slaughterHours: true,
      votingHours: true,
      jammingHours: true,
      submissionHours: true,
      ratingHours: true,
      postJamRefinementHours: true,
      postJamRatingHours: true,
      users: true,
      games: {
        select: {
          id: true,
          slug: true,
          category: true,
          published: true,
          ratings: true,
          ratingCategories: true,
          pages: {
            where: {
              version: PageVersion.JAM,
            },
            select: {
              version: true,
              tracks: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  ratings: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!jam) {
    next(new NotFoundError("Jam missing."));
    return;
  }

  const belongsToTenant = await doesCoreEntityBelongToTenant({
    entityType: "Jam",
    entityId: jam.id,
    tenantId: res.locals.tenantId,
  });
  if (!belongsToTenant) {
    next(new NotFoundError("Jam missing."));
    return;
  }

  res.locals.jam = {
    ...jam,
    games: (jam.games ?? []).map((game: any) => ({
      ...game,
      tracks:
        game.pages?.find((page: any) => page.version === PageVersion.JAM)?.tracks ??
        [],
    })),
  };
  next();
}

export default getJam;
