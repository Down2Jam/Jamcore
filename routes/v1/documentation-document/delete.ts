import { Router } from "express";

import authUser from "@middleware/authUser";
import assertUserAdmin from "@guards/assertUserAdmin";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  deleteDocumentationDocument,
  deleteDocumentationDocumentSchema,
} from "@features/content-admin";
import { parseBody } from "@lib/request";

const router = Router();

router.delete(
  "/",
  authUser,
  getUser,
  assertUserAdmin,
  asyncHandler(async (req, res) => {
    const { documentId } = parseBody(req, deleteDocumentationDocumentSchema);
    await deleteDocumentationDocument(documentId);

    res.json({ message: "Document deleted" });
  }),
);

export default router;

