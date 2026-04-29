import express from "express";

import authUser from "@middleware/authUser";
import authUserOptional from "@middleware/authUserOptional";
import getUser from "@loaders/getUser";
import getUserOptional from "@loaders/getUserOptional";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireRequestUser } from "../../lib/locals.js";
import { parseBody, parseParams } from "../../lib/request.js";
import {
  acceptQuiltSubmission,
  createQuilt,
  getQuiltDetail,
  listQuilts,
  quiltCreateSchema,
  quiltSlugParamsSchema,
  quiltSubmissionParamsSchema,
  quiltSubmissionSchema,
  quiltVoteSchema,
  removeQuiltSubmission,
  submitQuiltPixels,
  updateQuiltSubmission,
  voteQuiltSubmission,
} from "./index.js";

export function createQuiltsRouter() {
  const router = express.Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.setHeader("Cache-Control", "public, max-age=20, stale-while-revalidate=60");
      res.json({ data: await listQuilts(res.locals.tenantId) });
    }),
  );

  router.post(
    "/",
    rateLimit(),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, quiltCreateSchema);
      const quilt = await createQuilt({
        input,
        actor: requireRequestUser(res),
        tenantId: res.locals.tenantId,
      });
      res.status(201).json({ data: quilt });
    }),
  );

  router.get(
    "/:quiltSlug",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req, res) => {
      const { quiltSlug } = parseParams(req, quiltSlugParamsSchema);
      res.json({
        data: await getQuiltDetail({
          slug: quiltSlug,
          actor: res.locals.user,
          tenantId: res.locals.tenantId,
        }),
      });
    }),
  );

  router.post(
    "/:quiltSlug/submissions",
    rateLimit(10, 60_000),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { quiltSlug } = parseParams(req, quiltSlugParamsSchema);
      const input = parseBody(req, quiltSubmissionSchema);
      res.status(201).json({
        data: await submitQuiltPixels({
          slug: quiltSlug,
          input,
          actor: requireRequestUser(res),
          tenantId: res.locals.tenantId,
        }),
      });
    }),
  );

  router.post(
    "/submissions/:submissionId/accept",
    rateLimit(),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { submissionId } = parseParams(req, quiltSubmissionParamsSchema);
      res.json({
        data: await acceptQuiltSubmission({
          submissionId,
          actor: requireRequestUser(res),
          tenantId: res.locals.tenantId,
        }),
      });
    }),
  );

  router.post(
    "/submissions/:submissionId/vote",
    rateLimit(60, 60_000),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { submissionId } = parseParams(req, quiltSubmissionParamsSchema);
      const input = parseBody(req, quiltVoteSchema);
      res.json({
        data: await voteQuiltSubmission({
          submissionId,
          input,
          actor: requireRequestUser(res),
          tenantId: res.locals.tenantId,
        }),
      });
    }),
  );

  router.put(
    "/submissions/:submissionId",
    rateLimit(10, 60_000),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { submissionId } = parseParams(req, quiltSubmissionParamsSchema);
      const input = parseBody(req, quiltSubmissionSchema);
      res.json({
        data: await updateQuiltSubmission({
          submissionId,
          input,
          actor: requireRequestUser(res),
          tenantId: res.locals.tenantId,
        }),
      });
    }),
  );

  router.delete(
    "/submissions/:submissionId",
    rateLimit(),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const { submissionId } = parseParams(req, quiltSubmissionParamsSchema);
      res.json({
        data: await removeQuiltSubmission({
          submissionId,
          actor: requireRequestUser(res),
          tenantId: res.locals.tenantId,
        }),
      });
    }),
  );

  return router;
}
