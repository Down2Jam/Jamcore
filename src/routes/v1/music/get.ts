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
import { parseByteRange } from "../../../lib/byteRange.js";

const router = Router();

router.get(
  "/:filename",
  rateLimit(9999),
  asyncHandler(async (req, res) => {
    const { filename } = parseParams(req, musicFileParamsSchema);
    const file = await getMusicFileByName(filename, res.locals.tenantId);
    const rangeHeader = req.headers.range;

    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Accept-Ranges", "bytes");

    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, file.buffer.length);
      if (!range) {
        res.setHeader("Content-Range", `bytes */${file.buffer.length}`);
        res.sendStatus(416);
        return;
      }

      const chunk = file.buffer.subarray(range.start, range.end + 1);
      res.status(206);
      res.setHeader(
        "Content-Range",
        `bytes ${range.start}-${range.end}/${file.buffer.length}`,
      );
      res.setHeader("Content-Length", chunk.length.toString());
      res.send(chunk);
      return;
    }

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
