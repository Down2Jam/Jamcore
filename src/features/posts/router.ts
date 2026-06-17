import express from "express";
import { z } from "zod";

import authUser from "@middleware/authUser";
import authUserOptional from "@middleware/authUserOptional";
import getUser from "@loaders/getUser";
import getUserOptional from "@loaders/getUserOptional";
import { asyncHandler } from "@middleware/asyncHandler";
import { loadAuthorizationGrants } from "../../middleware/authorizationContext.js";
import {
  addPostToSeries,
  createPost,
  createPostSeries,
  createPostSeriesSchema,
  createPostSchema,
  deletePost,
  getPostSeries,
  listPostRevisions,
  listPostSeries,
  listPostSeriesQuerySchema,
  loadPost,
  loadPostPreview,
  postSeriesPostSchema,
  publishPost,
  removePostFromSeries,
  updatePostSeries,
  updatePostSeriesSchema,
  updatePost,
} from "./index.js";
import {
  autosavePostSchema,
  getPostAutosaves,
  savePostAutosave,
} from "./autosave.service.js";
import db from "../../infra/db.js";
import { NotFoundError } from "../../lib/errors.js";
import { assertPostBelongsToTenant } from "../../lib/contentTenant.js";
import { requireRequestUser } from "../../lib/locals.js";
import { parseBody, parseParams, parseQuery } from "../../lib/request.js";

const postParamsSchema = z.object({
  postSlug: z.string().trim().min(1),
});

const postViewerQuerySchema = z.object({
  user: z.string().trim().min(1).optional(),
  previewToken: z.string().trim().min(16).optional(),
});

const updatePostBySlugSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    tags: z.array(z.number().int().positive()).optional(),
    sticky: z.boolean().optional(),
    draftStatus: z.enum(["draft", "scheduled", "published"]).optional(),
    scheduledPublishAt: z.string().datetime().optional().nullable(),
    rotatePreviewToken: z.boolean().optional(),
    gameLinks: z.array(z.object({
      gameId: z.coerce.number().int().positive(),
      relationType: z.enum(["devlog", "release", "postmortem", "announcement", "other"]).optional().default("devlog"),
    })).optional(),
    collaboratorSlugs: z.array(z.string().trim().min(1)).optional(),
  })
  .refine(
    (payload) =>
      payload.title !== undefined ||
      payload.content !== undefined ||
      payload.tags !== undefined ||
      payload.sticky !== undefined ||
      payload.draftStatus !== undefined ||
      payload.scheduledPublishAt !== undefined ||
      payload.rotatePreviewToken !== undefined ||
      payload.gameLinks !== undefined ||
      payload.collaboratorSlugs !== undefined,
    {
      message: "No update fields provided.",
    },
  );

const deletePostBySlugSchema = z.object({
  mode: z.enum(["delete", "remove"]).optional().default("delete"),
});

const postSeriesParamsSchema = z.object({
  seriesId: z.string().trim().min(1),
});

const postSeriesPostParamsSchema = postSeriesParamsSchema.extend({
  postId: z.coerce.number().int().positive(),
});

export function createPostsRouter() {
  const router = express.Router();

  router.get(
    "/autosave",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      parseQuery(req, z.object({
        postId: z.coerce.number().int().positive().optional(),
      }));
      res.json(await getPostAutosaves({
        actor: requireRequestUser(res),
        tenantId: res.locals.tenantId,
      }));
    }),
  );

  router.post(
    "/autosave",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, autosavePostSchema);
      res.json(await savePostAutosave({
        actor: requireRequestUser(res),
        input,
        tenantId: res.locals.tenantId,
      }));
    }),
  );

  router.get(
    "/series",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req, res) => {
      const input = parseQuery(req, listPostSeriesQuerySchema);
      res.json(await listPostSeries({
        actor: res.locals.user,
        input,
        tenantId: res.locals.tenantId,
      }));
    }),
  );

  router.post(
    "/series",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, createPostSeriesSchema);
      res.status(201).json(await createPostSeries({
        actor: requireRequestUser(res),
        input,
        tenantId: res.locals.tenantId,
      }));
    }),
  );

  router.get(
    "/series/:seriesId",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req, res) => {
      const { seriesId } = parseParams(req, postSeriesParamsSchema);
      res.json(await getPostSeries({
        seriesId,
        actor: res.locals.user,
      }));
    }),
  );

  router.put(
    "/series/:seriesId",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { seriesId } = parseParams(req, postSeriesParamsSchema);
      const input = parseBody(req, updatePostSeriesSchema);
      res.json(await updatePostSeries({
        seriesId,
        actor: requireRequestUser(res),
        input,
      }));
    }),
  );

  router.post(
    "/series/:seriesId/posts",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { seriesId } = parseParams(req, postSeriesParamsSchema);
      const input = parseBody(req, postSeriesPostSchema);
      res.status(201).json(await addPostToSeries({
        seriesId,
        actor: requireRequestUser(res),
        input,
        tenantId: res.locals.tenantId,
      }));
    }),
  );

  router.delete(
    "/series/:seriesId/posts/:postId",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { seriesId, postId } = parseParams(req, postSeriesPostParamsSchema);
      res.json(await removePostFromSeries({
        seriesId,
        postId,
        actor: requireRequestUser(res),
      }));
    }),
  );

  router.get(
    "/preview/:previewToken",
    asyncHandler(async (req, res) => {
      const { previewToken } = parseParams(
        req,
        z.object({ previewToken: z.string().trim().min(16) }),
      );
      const post = await loadPostPreview(previewToken, res.locals.tenantId);
      res.send(post);
    }),
  );

  router.get(
    "/:postSlug",
    asyncHandler(async (req, res) => {
      const { postSlug } = parseParams(req, postParamsSchema);
      const query = parseQuery(req, postViewerQuerySchema);
      const post = await loadPost({
        slug: postSlug,
        user: query.user,
        previewToken: query.previewToken,
      }, res.locals.tenantId);

      res.send(post);
    }),
  );

  router.get(
    "/:postSlug/revisions",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { postSlug } = parseParams(req, postParamsSchema);
      const targetPost = await db.post.findUnique({
        where: { slug: postSlug },
        select: { id: true },
      });

      if (!targetPost) {
        throw new NotFoundError("Post not found");
      }

      const result = await listPostRevisions({
        postId: targetPost.id,
        actor: requireRequestUser(res),
        tenantId: res.locals.tenantId,
      });
      res.json(result);
    }),
  );

  router.post(
    "/:postSlug/publish",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { postSlug } = parseParams(req, postParamsSchema);
      const targetPost = await db.post.findUnique({
        where: { slug: postSlug },
        select: { id: true },
      });

      if (!targetPost) {
        throw new NotFoundError("Post not found");
      }

      const result = await publishPost({
        actor: requireRequestUser(res),
        input: { postId: targetPost.id },
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
      const input = parseBody(req, createPostSchema);
      await createPost({
        actor: res.locals.user,
        input,
        tenantId: res.locals.tenantId,
      });

      res.send("Post created");
    }),
  );

  router.put(
    "/:postSlug",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { postSlug } = parseParams(req, postParamsSchema);
      const body = parseBody(req, updatePostBySlugSchema);
      const targetPost = await db.post.findUnique({
        where: { slug: postSlug },
        select: { id: true },
      });

      if (!targetPost) {
        throw new NotFoundError("Post not found");
      }

      await assertPostBelongsToTenant(targetPost.id, res.locals.tenantId);
      const grants = await loadAuthorizationGrants(res);
      const updatedPost = await updatePost({
        actor: res.locals.user,
        input: {
          ...body,
          postId: targetPost.id,
        },
        grants,
        tenantId: res.locals.tenantId,
      });

      res.json(updatedPost);
    }),
  );

  router.delete(
    "/:postSlug",
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { postSlug } = parseParams(req, postParamsSchema);
      const body = parseBody(req, deletePostBySlugSchema);
      const targetPost = await db.post.findUnique({
        where: { slug: postSlug },
        select: { id: true },
      });

      if (!targetPost) {
        throw new NotFoundError("Post not found");
      }

      await assertPostBelongsToTenant(targetPost.id, res.locals.tenantId);
      const grants = await loadAuthorizationGrants(res);
      const result = await deletePost({
        actor: res.locals.user,
        input: {
          ...body,
          postId: targetPost.id,
        },
        grants,
        tenantId: res.locals.tenantId,
      });

      res.send(result.mode === "remove" ? "Post removed." : "Post deleted.");
    }),
  );

  return router;
}
