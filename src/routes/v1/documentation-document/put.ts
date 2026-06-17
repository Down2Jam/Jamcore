import { Router } from "express";

import authUser from "@middleware/authUser";
import assertUserAdmin from "@guards/assertUserAdmin";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  updateDocumentationDocument,
  updateDocumentationDocumentSchema,
} from "@features/content-admin";
import { parseBody } from "@lib/request";

const router = Router();

router.put(
  "/",
  authUser,
  getUser,
  assertUserAdmin,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, updateDocumentationDocumentSchema);
    const updatedDocument = await updateDocumentationDocument(input);

    res.json({ data: updatedDocument });
  }),
);

export default router;

