import { Router } from "express";

import authUser from "@middleware/authUser";
import assertUserAdmin from "@guards/assertUserAdmin";
import getUser from "@loaders/getUser";
import { asyncHandler } from "@middleware/asyncHandler";
import {
  createDocumentationDocument,
  createDocumentationDocumentSchema,
} from "@features/content-admin";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "@lib/request";

const router = Router();

router.post(
  "/",
  authUser,
  getUser,
  assertUserAdmin,
  asyncHandler(async (req, res) => {
    const input = parseBody(req, createDocumentationDocumentSchema);
    const user = requireRequestUser(res);
    const document = await createDocumentationDocument({
      ...input,
      authorId: user.id,
    });

    res.json({ data: document });
  }),
);

export default router;

