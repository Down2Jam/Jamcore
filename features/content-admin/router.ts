import { Router } from "express";

import assertUserAdmin from "@guards/assertUserAdmin";
import authUser from "@middleware/authUser";
import { asyncHandler } from "@middleware/asyncHandler";
import getUser from "@loaders/getUser";
import { requireRequestUser } from "@lib/locals";
import { parseBody, parseQuery } from "@lib/request";
import {
  createDocumentationDocument,
  createDocumentationDocumentSchema,
  createPressKitMedia,
  createPressKitMediaSchema,
  deleteDocumentationDocument,
  deleteDocumentationDocumentSchema,
  deletePressKitMedia,
  deletePressKitMediaSchema,
  getDocumentationDocumentBySlug,
  getDocumentationDocumentQuerySchema,
  listDocumentationDocuments,
  listDocumentationDocumentsQuerySchema,
  listPressKitMedia,
  updateDocumentationDocument,
  updateDocumentationDocumentSchema,
} from "./service.js";

export function createContentAdminRouter() {
  const router = Router();

  router.get(
    "/documentation-document",
    asyncHandler(async (req, res) => {
      const input = parseQuery(req, getDocumentationDocumentQuerySchema);
      const document = await getDocumentationDocumentBySlug(input);

      res.json({ data: document });
    }),
  );

  router.post(
    "/documentation-document",
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

  router.put(
    "/documentation-document",
    authUser,
    getUser,
    assertUserAdmin,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, updateDocumentationDocumentSchema);
      const updatedDocument = await updateDocumentationDocument(input);

      res.json({ data: updatedDocument });
    }),
  );

  router.delete(
    "/documentation-document",
    authUser,
    getUser,
    assertUserAdmin,
    asyncHandler(async (req, res) => {
      const { documentId } = parseBody(req, deleteDocumentationDocumentSchema);
      await deleteDocumentationDocument(documentId);

      res.json({ message: "Document deleted" });
    }),
  );

  router.get(
    "/documentation-documents",
    asyncHandler(async (req, res) => {
      const input = parseQuery(req, listDocumentationDocumentsQuerySchema);
      const documents = await listDocumentationDocuments(input);

      res.json({ data: documents });
    }),
  );

  router.get(
    "/press-kit-media",
    asyncHandler(async (_req, res) => {
      const media = await listPressKitMedia();

      res.json({ data: media });
    }),
  );

  router.post(
    "/press-kit-media",
    authUser,
    getUser,
    assertUserAdmin,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, createPressKitMediaSchema);
      const user = requireRequestUser(res);
      const media = await createPressKitMedia({
        ...input,
        authorId: user.id,
      });

      res.json({ data: media });
    }),
  );

  router.delete(
    "/press-kit-media",
    authUser,
    getUser,
    assertUserAdmin,
    asyncHandler(async (req, res) => {
      const { mediaId } = parseBody(req, deletePressKitMediaSchema);
      await deletePressKitMedia(mediaId);

      res.json({ message: "Media deleted" });
    }),
  );

  return router;
}
