import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "@middleware/asyncHandler";
import authUserOptional from "@middleware/authUserOptional";
import { getCurrentActiveJam } from "@features/jams";
import { getResults, resultsQuerySchema } from "@features/results";
import db from "@infra/db";
import { doesCoreEntityBelongToTenant } from "../../../infra/coreTenantStore.js";
import { NotFoundError } from "../../../lib/errors.js";
import { parseQuery } from "../../../lib/request.js";

const router = Router();

/**
 * Route to get the results
 */
router.get(
  "/",
  rateLimit(),
  authUserOptional,
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, resultsQuerySchema);
    const explicitSlug = typeof req.query.jamSlug === "string" ? req.query.jamSlug.trim() : "";
    const explicitId = typeof req.query.jamId === "string" ? Number(req.query.jamId) : null;
    const jamValue = input.jam?.trim() ?? "";
    const jamSlug = explicitSlug || (jamValue && Number.isNaN(Number(jamValue)) ? jamValue : "");
    const jamId = explicitId || (!jamSlug && jamValue ? Number(jamValue) : null);
    const jam = jamSlug || jamId
      ? await db.jam.findFirst({
          where: jamSlug ? { slug: jamSlug } : { id: jamId! },
          select: {
            id: true,
            slug: true,
            startTime: true,
            jammingHours: true,
            submissionHours: true,
            ratingHours: true,
          },
        })
      : (await getCurrentActiveJam(res.locals.tenantId)).jam;

    if (!jam || !(await doesCoreEntityBelongToTenant({
      entityType: "Jam",
      entityId: jam.id,
      tenantId: res.locals.tenantId,
    }))) {
      throw new NotFoundError("Jam missing.");
    }

    const viewer = input.preview === "1" && res.locals.userSlug && res.locals.authMethod === "session"
      ? await db.user.findUnique({
          where: { slug: res.locals.userSlug },
          select: { admin: true },
        })
      : null;
    const result = await getResults({
      input,
      jam,
      viewer,
    });

    res.json(result);
  }),
);

export default router;

