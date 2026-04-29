import express from "express";
import authUser from "@middleware/authUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  parseTrackPageVersion,
  trackParamsSchema,
  updateTrackBySlug,
  updateTrackSchema,
} from "@features/tracks";
import getUser from "@loaders/getUser";
import rateLimit from "@middleware/rateLimit";
import { parseBody, parseParams, parseQuery } from "../../../lib/request.js";
import { requireRequestUser } from "@lib/locals";
import { z } from "zod";

const router = express.Router();
const trackUpdateQuerySchema = z.object({
  pageVersion: z.unknown().optional(),
});

router.put(
  "/:trackSlug",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { trackSlug } = parseParams(req, trackParamsSchema);
    const query = parseQuery(req, trackUpdateQuerySchema);
    const input = parseBody(req, updateTrackSchema);
    const actor = requireRequestUser(res);
    const updated = await updateTrackBySlug({
      trackSlug,
      pageVersionInput: parseTrackPageVersion(query.pageVersion),
      actor,
      input,
    });

    res.json({ message: "Track updated", data: updated });
  }),
);

export default router;

