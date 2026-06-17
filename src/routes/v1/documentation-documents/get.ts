import { Router } from "express";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  listDocumentationDocuments,
  listDocumentationDocumentsQuerySchema,
} from "@features/content-admin";
import { parseQuery } from "@lib/request";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseQuery(req, listDocumentationDocumentsQuerySchema);
    const documents = await listDocumentationDocuments(input);

    res.json({ data: documents });
  }),
);

export default router;
