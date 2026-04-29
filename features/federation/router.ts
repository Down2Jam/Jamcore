import express from "express";
import type { ParsedQs } from "qs";

import { appConfig } from "../../config/app.js";
import getUserOptional from "../../loaders/getUserOptional.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import authUserOptional from "../../middleware/authUserOptional.js";
import { authServiceOptional } from "../../middleware/authServiceOptional.js";
import { requirePolicy } from "../../middleware/requirePolicy.js";
import {
  buildActivityResponse,
  buildCommentObject,
  buildFollowersCollection,
  buildFollowingCollection,
  buildGameObject,
  buildJamActor,
  buildJamOutboxCollection,
  buildNodeInfo,
  buildNodeInfoWellKnown,
  buildPostObject,
  buildTrackObject,
  buildUserActor,
  buildUserOutboxCollection,
  buildWebFingerForJam,
  buildWebFingerForUser,
  getCommentObjectId,
  getFederatedCommentById,
  getFederatedGameBySlug,
  getFederationDeliveryRecord,
  getFederationJamSnapshot,
  getFederationStats,
  getFederationUserBySlug,
  getFederatedPostById,
  getFederatedTrackBySlug,
  getInboxTargetForJam,
  getInboxTargetForUser,
  getJamActorHandle,
  getJamActorId,
  getJamInboxId,
  getJamOutboxId,
  getLocalPublicKeyPem,
  getPostObjectId,
  getGameObjectId,
  getTrackObjectId,
  getUserActorId,
  getUserInboxId,
  getUserOutboxId,
  handleInboxActivity,
  listFederationDeliveryRecords,
  sendActivityJson,
  verifyFederationSignature,
} from "./index.js";

function normalizeAcctHandle(resource: string) {
  return resource
    .trim()
    .replace(/^acct:/i, "")
    .replace(/^@/, "")
    .toLowerCase();
}

function getStringQueryValue(
  value: string | ParsedQs | (string | ParsedQs)[] | undefined,
) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : undefined;
  }

  return undefined;
}

function getRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function createFederationRouter() {
  const router = express.Router();

  if (!appConfig.federation.enabled) {
    return router;
  }

  router.get(
    "/.well-known/webfinger",
    asyncHandler(async (req, res) => {
      const resource = String(req.query.resource ?? "");
      if (!resource) {
        return res.status(400).json({ message: "resource is required" });
      }

      const normalized = normalizeAcctHandle(resource);
      const jamHandle = getJamActorHandle().toLowerCase();

      if (normalized === jamHandle) {
        return res.type("application/jrd+json").send(buildWebFingerForJam());
      }

      const [slug, host] = normalized.split("@");
      if (!slug || !host) {
        return res.status(404).json({ message: "Unknown federated resource" });
      }

      const actorHost = new URL(getUserActorId(slug)).hostname.toLowerCase();
      if (host !== actorHost) {
        return res.status(404).json({ message: "Unknown federated resource" });
      }

      const user = await getFederationUserBySlug(slug, res.locals.tenantId);
      return res.type("application/jrd+json").send(buildWebFingerForUser(user));
    }),
  );

  router.get("/.well-known/nodeinfo", (_req, res) => {
    return res.json(buildNodeInfoWellKnown());
  });

  router.get(
    "/nodeinfo/2.1",
    asyncHandler(async (_req, res) => {
      const stats = await getFederationStats(res.locals.tenantId);
      return res.json(buildNodeInfo(stats));
    }),
  );

  router.get(
    "/ap/actors/jam",
    asyncHandler(async (_req, res) => {
      const jam = await getFederationJamSnapshot(res.locals.tenantId);
      return sendActivityJson(res, buildJamActor(jam, getLocalPublicKeyPem()));
    }),
  );

  router.get(
    "/ap/actors/jam/outbox",
    asyncHandler(async (req, res) => {
      const limit = Number(getStringQueryValue(req.query.limit) ?? 20);
      return sendActivityJson(
        res,
        await buildJamOutboxCollection(limit, res.locals.tenantId),
      );
    }),
  );

  router.get(
    "/ap/actors/jam/followers",
    asyncHandler(async (_req, res) =>
      sendActivityJson(res, await buildFollowersCollection(getJamActorId())),
    ),
  );

  router.get(
    "/ap/actors/jam/following",
    asyncHandler(async (_req, res) =>
      sendActivityJson(res, await buildFollowingCollection(getJamActorId())),
    ),
  );

  router.get(
    "/ap/actors/jam/featured",
    (_req, res) =>
      sendActivityJson(res, {
        "@context": "https://www.w3.org/ns/activitystreams",
        id: `${getJamActorId()}/featured`,
        type: "OrderedCollection",
        totalItems: 0,
        orderedItems: [],
      }),
  );

  router.post(
    "/ap/actors/jam/inbox",
    verifyFederationSignature,
    asyncHandler(async (req, res) => {
      const result = await handleInboxActivity({
        target: getInboxTargetForJam(),
        body: req.body,
        tenantId: res.locals.tenantId,
      });

      return res
        .status(result.statusCode)
        .json(
          buildActivityResponse(
            result.summary,
            result.activity,
            result.deliveryId,
          ),
        );
    }),
  );

  router.get(
    "/ap/actors/users/:slug",
    asyncHandler(async (req, res) => {
      const slug = String(getRouteParam(req.params.slug) ?? "");
      const user = await getFederationUserBySlug(slug, res.locals.tenantId);
      return sendActivityJson(
        res,
        buildUserActor(user, getLocalPublicKeyPem()),
      );
    }),
  );

  router.get(
    "/ap/actors/users/:slug/outbox",
    asyncHandler(async (req, res) => {
      const limit = Number(getStringQueryValue(req.query.limit) ?? 20);
      const slug = String(getRouteParam(req.params.slug) ?? "");
      await getFederationUserBySlug(slug, res.locals.tenantId);
      return sendActivityJson(
        res,
        await buildUserOutboxCollection({
          slug,
          limit,
          tenantId: res.locals.tenantId,
        }),
      );
    }),
  );

  router.get(
    "/ap/actors/users/:slug/followers",
    asyncHandler(async (req, res) => {
      const slug = String(getRouteParam(req.params.slug) ?? "");
      await getFederationUserBySlug(slug, res.locals.tenantId);
      return sendActivityJson(
        res,
        await buildFollowersCollection(getUserActorId(slug)),
      );
    }),
  );

  router.get(
    "/ap/actors/users/:slug/following",
    asyncHandler(async (req, res) => {
      const slug = String(getRouteParam(req.params.slug) ?? "");
      await getFederationUserBySlug(slug, res.locals.tenantId);
      return sendActivityJson(
        res,
        await buildFollowingCollection(getUserActorId(slug)),
      );
    }),
  );

  router.get(
    "/ap/actors/users/:slug/featured",
    asyncHandler(async (req, res) => {
      const slug = String(getRouteParam(req.params.slug) ?? "");
      await getFederationUserBySlug(slug, res.locals.tenantId);
      return sendActivityJson(
        res,
        {
          "@context": "https://www.w3.org/ns/activitystreams",
          id: `${getUserActorId(slug)}/featured`,
          type: "OrderedCollection",
          totalItems: 0,
          orderedItems: [],
        },
      );
    }),
  );

  router.post(
    "/ap/actors/users/:slug/inbox",
    verifyFederationSignature,
    asyncHandler(async (req, res) => {
      const slug = String(getRouteParam(req.params.slug) ?? "");
      await getFederationUserBySlug(slug, res.locals.tenantId);
      const result = await handleInboxActivity({
        target: getInboxTargetForUser(slug),
        body: req.body,
        tenantId: res.locals.tenantId,
      });

      return res
        .status(result.statusCode)
        .json(
          buildActivityResponse(
            result.summary,
            result.activity,
            result.deliveryId,
          ),
        );
    }),
  );

  router.get(
    "/ap/objects/posts/:id",
    asyncHandler(async (req, res) => {
      const post = await getFederatedPostById(
        Number(req.params.id),
        res.locals.tenantId,
      );
      return sendActivityJson(res, buildPostObject(post));
    }),
  );

  router.get(
    "/ap/objects/comments/:id",
    asyncHandler(async (req, res) => {
      const comment = await getFederatedCommentById(
        Number(req.params.id),
        res.locals.tenantId,
      );
      return sendActivityJson(res, buildCommentObject(comment));
    }),
  );

  router.get(
    "/ap/objects/games/:slug",
    asyncHandler(async (req, res) => {
      const game = await getFederatedGameBySlug(
        String(getRouteParam(req.params.slug) ?? ""),
        res.locals.tenantId,
      );
      return sendActivityJson(res, buildGameObject(game));
    }),
  );

  router.get(
    "/ap/objects/tracks/:slug",
    asyncHandler(async (req, res) => {
      const track = await getFederatedTrackBySlug(
        String(getRouteParam(req.params.slug) ?? ""),
        res.locals.tenantId,
      );
      return sendActivityJson(res, buildTrackObject(track));
    }),
  );

  router.get("/ap", (_req, res) => {
    return res.json({
      actor: getJamActorId(),
      inbox: getJamInboxId(),
      outbox: getJamOutboxId(),
      handle: getJamActorHandle(),
      objects: {
        posts: getPostObjectId(1).replace(/\/1$/, "/:id"),
        comments: getCommentObjectId(1).replace(/\/1$/, "/:id"),
        games: getGameObjectId(":slug"),
        tracks: getTrackObjectId(":slug"),
      },
    });
  });

  router.get(
    "/ap/deliveries",
    authServiceOptional,
    authUserOptional,
    getUserOptional,
    requirePolicy("platform.read"),
    (req, res) => {
      const limit = Math.max(
        1,
        Math.min(
          100,
          Number.parseInt(String(getStringQueryValue(req.query.limit) ?? "25"), 10) ||
            25,
        ),
      );

      return res.json({
        data: listFederationDeliveryRecords(limit),
      });
    },
  );

  router.get(
    "/ap/deliveries/:id",
    authServiceOptional,
    authUserOptional,
    getUserOptional,
    requirePolicy("platform.read"),
    (req, res) => {
      const record = getFederationDeliveryRecord(
        String(getRouteParam(req.params.id) ?? ""),
      );
      if (!record) {
        return res.status(404).json({ message: "Delivery not found" });
      }

      return res.json({ data: record });
    },
  );

  return router;
}
