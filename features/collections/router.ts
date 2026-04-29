import express from "express";
import { z } from "zod";

import authUser from "@middleware/authUser";
import authUserOptional from "@middleware/authUserOptional";
import getUser from "@loaders/getUser";
import getUserOptional from "@loaders/getUserOptional";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRequestUser } from "../../lib/locals.js";
import { parseBody, parseParams, parseQuery } from "../../lib/request.js";
import {
  addCollectionItem,
  addCollectionComment,
  collectionCommentSchema,
  collectionCommentsQuerySchema,
  collectionImportSchema,
  collectionItemSchema,
  createCollection,
  createCollectionSchema,
  deleteCollection,
  deleteCollectionComment,
  exportCollection,
  forkCollection,
  getCollection,
  getCollectionComments,
  getCollectionPlayback,
  followCollection,
  importCollection,
  inviteCollectionCollaborator,
  inviteCollectionCollaboratorSchema,
  listCollections,
  listCollectionsQuerySchema,
  removeCollectionItem,
  respondCollectionCollaboratorInvite,
  respondCollectionCollaboratorSchema,
  updateCollection,
  updateCollectionSchema,
} from "./index.js";

const collectionParamsSchema = z.object({
  collectionId: z.string().trim().min(1),
});

  const collectionItemParamsSchema = collectionParamsSchema.extend({
  itemId: z.string().trim().min(1),
});

const collectionCommentParamsSchema = collectionParamsSchema.extend({
  commentId: z.string().trim().min(1),
});

export function createCollectionsRouter() {
  const router = express.Router();

  router.get(
    "/",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req, res) => {
      const input = parseQuery(req, listCollectionsQuerySchema);
      const result = await listCollections({
        actor: res.locals.user,
        input,
        tenantId: res.locals.tenantId,
      });
      res.json(result);
    }),
  );

  router.post(
    "/",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, createCollectionSchema);
      const result = await createCollection({
        actor: requireRequestUser(res),
        input,
        tenantId: res.locals.tenantId,
      });
      res.status(201).json(result);
    }),
  );

  router.post(
    "/import",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, collectionImportSchema);
      const result = await importCollection({
        actor: requireRequestUser(res),
        input,
        tenantId: res.locals.tenantId,
      });
      res.status(201).json(result);
    }),
  );

  router.get(
    "/:collectionId",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const result = await getCollection({
        collectionId,
        actor: res.locals.user,
      });
      res.json(result);
    }),
  );

  router.get(
    "/:collectionId/export",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      res.json(await exportCollection({
        collectionId,
        actor: res.locals.user,
      }));
    }),
  );

  router.get(
    "/:collectionId/playback",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const query = parseQuery(req, z.object({
        shuffle: z.union([z.literal("true"), z.literal("false")]).optional(),
      }));
      const result = await getCollectionPlayback({
        collectionId,
        actor: res.locals.user,
        shuffle: query.shuffle === "true",
      });
      res.json(result);
    }),
  );

  router.post(
    "/:collectionId/fork",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const result = await forkCollection({
        collectionId,
        actor: requireRequestUser(res),
        tenantId: res.locals.tenantId,
      });
      res.status(201).json(result);
    }),
  );

  router.post(
    "/:collectionId/follow",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const body = parseBody(req, z.object({
        follow: z.boolean().optional().default(true),
      }));
      res.json(await followCollection({
        collectionId,
        actor: requireRequestUser(res),
        follow: body.follow,
      }));
    }),
  );

  router.post(
    "/:collectionId/comments",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const input = parseBody(req, collectionCommentSchema);
      const result = await addCollectionComment({
        collectionId,
        actor: requireRequestUser(res),
        input,
      });
      res.status(201).json(result);
    }),
  );

  router.get(
    "/:collectionId/comments",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const input = parseQuery(req, collectionCommentsQuerySchema);
      res.json(await getCollectionComments({
        collectionId,
        actor: res.locals.user,
        input,
      }));
    }),
  );

  router.delete(
    "/:collectionId/comments/:commentId",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId, commentId } = parseParams(req, collectionCommentParamsSchema);
      res.json(await deleteCollectionComment({
        collectionId,
        commentId,
        actor: requireRequestUser(res),
      }));
    }),
  );

  router.put(
    "/:collectionId",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const input = parseBody(req, updateCollectionSchema);
      const result = await updateCollection({
        collectionId,
        actor: requireRequestUser(res),
        input,
      });
      res.json(result);
    }),
  );

  router.delete(
    "/:collectionId",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const result = await deleteCollection({
        collectionId,
        actor: requireRequestUser(res),
      });
      res.json(result);
    }),
  );

  router.post(
    "/:collectionId/collaborators",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const input = parseBody(req, inviteCollectionCollaboratorSchema);
      const result = await inviteCollectionCollaborator({
        collectionId,
        actor: requireRequestUser(res),
        input,
      });
      res.status(201).json(result);
    }),
  );

  router.put(
    "/:collectionId/collaborators/me",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const input = parseBody(req, respondCollectionCollaboratorSchema);
      const result = await respondCollectionCollaboratorInvite({
        collectionId,
        actor: requireRequestUser(res),
        input,
      });
      res.json(result);
    }),
  );

  router.post(
    "/:collectionId/items",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId } = parseParams(req, collectionParamsSchema);
      const input = parseBody(req, collectionItemSchema);
      const result = await addCollectionItem({
        collectionId,
        actor: requireRequestUser(res),
        input,
        tenantId: res.locals.tenantId,
      });
      res.status(201).json(result);
    }),
  );

  router.delete(
    "/:collectionId/items/:itemId",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { collectionId, itemId } = parseParams(req, collectionItemParamsSchema);
      const result = await removeCollectionItem({
        collectionId,
        itemId,
        actor: requireRequestUser(res),
      });
      res.json(result);
    }),
  );

  return router;
}
