import { Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  getDocumentationDocumentBySlug,
  getDocumentationDocumentQuerySchema,
} from "@features/content-admin";
import { parseQuery } from "@lib/request";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, getDocumentationDocumentQuerySchema);
    const document = await getDocumentationDocumentBySlug(input);

    res.json({ data: document });
  }),
);

export default router;
