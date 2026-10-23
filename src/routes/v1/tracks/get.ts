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
import { getTrackDownloadDetails } from "../../../features/tracks/download-details.js";
import { parseTrackPageVersion } from "../../../features/tracks/page.js";

const router = express.Router();
router.get("/:trackSlug/download-details", asyncHandler(async (req, res) => {
  const { trackSlug } = parseParams(req, trackParamsSchema);
  const query = parseQuery(req, trackDetailQuerySchema);
  res.setHeader("Cache-Control", "no-store");
  res.json({ data: await getTrackDownloadDetails(trackSlug, parseTrackPageVersion(query.pageVersion), res.locals.tenantId) });
}));
router.get("/audio-analysis", asyncHandler(async (req, res) => {
  const source = typeof req.query.source === "string" ? req.query.source : "";
  const { readAudioAnalysis } = await import("../../../features/uploads/audio-analysis.runtime.js");
  const data = source.length <= 2048 ? await readAudioAnalysis(source, res.locals.tenantId) : null;
  res.setHeader("Cache-Control", data ? "private, max-age=3600" : "no-store");
  res.json({ data });
}));
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

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
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

