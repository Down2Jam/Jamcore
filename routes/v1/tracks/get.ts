import express from "express";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@loaders/getUserOptional";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  getTrackBySlug,
  getRandomTrack,
  listTracks,
  listTracksQuerySchema,
  trackDetailQuerySchema,
  trackParamsSchema,
} from "@features/tracks";
import { parseParams, parseQuery } from "../../../lib/request.js";

const router = express.Router();
router.get(
  "/random",
  asyncHandler(async (_req, res) => {
    const track = await getRandomTrack(res.locals.tenantId);

    res.json({
      message: "Fetched random track",
      data: track,
    });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, listTracksQuerySchema);
    const result = await listTracks(input, res.locals.tenantId);

    res.json(result);
  }),
);

router.get(
  "/:trackSlug",
  authUserOptional,
  getUserOptional,
  asyncHandler(async (req, res) => {
    const { trackSlug } = parseParams(req, trackParamsSchema);
    const query = parseQuery(req, trackDetailQuerySchema);
    const track = await getTrackBySlug({
      trackSlug,
      pageVersionInput: query.pageVersion,
      viewer: res.locals.user,
      tenantId: res.locals.tenantId,
    });

    res.json(track);
  }),
);

export default router;

