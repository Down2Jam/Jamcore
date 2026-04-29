import { Router } from "express";

import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import {
  buildTrackDownloadBySlug,
  getMusicFileByName,
  musicFileParamsSchema,
  trackDownloadParamsSchema,
  trackDownloadQuerySchema,
} from "@features/tracks";
import { parseParams, parseQuery } from "../../../lib/request.js";

const router = Router();

router.get(
  "/:filename",
  rateLimit(9999),
  asyncHandler(async (req, res) => {
    const { filename } = parseParams(req, musicFileParamsSchema);
    const file = await getMusicFileByName(filename, res.locals.tenantId);

    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", file.buffer.length.toString());
    res.send(file.buffer);
  }),
);

router.get(
  "/track/:trackSlug/download",
  rateLimit(9999),
  asyncHandler(async (req, res) => {
    const { trackSlug } = parseParams(req, trackDownloadParamsSchema);
    const query = parseQuery(req, trackDownloadQuerySchema);
    const file = await buildTrackDownloadBySlug({
      trackSlug,
      pageVersionInput: query.pageVersion,
      tenantId: res.locals.tenantId,
    });

    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", file.buffer.length.toString());
    res.setHeader("Content-Disposition", file.contentDisposition);
    res.send(file.buffer);
  }),
);

export default router;
