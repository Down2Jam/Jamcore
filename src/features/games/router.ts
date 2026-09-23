import type { NextFunction, Request, Response } from "express";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import db from "../../infra/db.js";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";

import authUser from "@middleware/authUser";
import authUserOptional from "@middleware/authUserOptional";
import assertJamPhaseIn from "@guards/assertJamPhaseIn";
import assertTargetTeamDoesNotHaveGame from "@guards/assertTargetTeamDoesNotHaveGame";
import assertUserIsInTargetTeam from "@guards/assertUserIsInTargetTeam";
import rateLimit from "@middleware/rateLimit";
import getJam from "@loaders/getJam";
import getTargetTeam from "@loaders/getTargetTeam";
import { asyncHandler } from "@middleware/asyncHandler";
import getUser from "@loaders/getUser";
import getUserOptional from "@loaders/getUserOptional";
import { loadAuthorizationGrants } from "../../middleware/authorizationContext.js";
import { JAM_PHASES } from "../../domain/jamTimeline.js";
import {
  createGame,
  createGameSchema,
  importItchGame,
  importItchGameSchema,
  previewItchGame,
  createPostJamPage,
  gameDetailParamsSchema,
  gameDetailQuerySchema,
  gameDevlogQuerySchema,
  gameListingQuerySchema,
  featuredGameVideosQuerySchema,
  getRandomPublishedGame,
  listFeaturedGameVideos,
  listGameDevlogPosts,
  listGames,
  loadGameDetailResponse,
  parseListingPageVersion,
  updateGameBySlug,
  updateGameSchema,
} from "./index.js";
import { BadRequestError, NotFoundError } from "@lib/errors";
import { parseBody, parseParams, parseQuery } from "../../lib/request.js";
import { requireRequestUser } from "../../lib/locals.js";
import {
  MAX_WEB_BUILD_ARCHIVE_BYTES,
  assertWebBuildQuota,
  deleteStoredWebBuild,
  registerWebBuild,
  storeWebBuildArchive,
  acquireWebBuildProcessingSlot,
} from "./web-build.service.js";
import { scanWebBuildArchive } from "./web-build.scan.js";

export function createGamesRouter() {
  const router = express.Router();

  const webBuildStagingDir = path.resolve(process.cwd(), ".jamcore", "web-build-staging");
  const webBuildUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        fs.mkdirSync(webBuildStagingDir, { recursive: true, mode: 0o700 });
        callback(null, webBuildStagingDir);
      },
      filename: (_req, _file, callback) => callback(null, `${uuidv4()}.zip`),
    }),
    limits: { fileSize: MAX_WEB_BUILD_ARCHIVE_BYTES, files: 1 },
    fileFilter: (_req, file, callback) => {
      const isZip =
        file.originalname.toLowerCase().endsWith(".zip") &&
        [
          "application/octet-stream",
          "application/zip",
          "application/x-zip-compressed",
        ].includes(file.mimetype);
      if (!isZip) {
        callback(new BadRequestError("Web builds must be uploaded as a ZIP file."));
        return;
      }
      callback(null, true);
    },
  });
  const parseWebBuildUpload = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    webBuildUpload.single("upload")(req, res, (error) => {
      if (error) {
        next(
          error instanceof BadRequestError
            ? error
            : new BadRequestError(
                error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
                  ? "The web build ZIP must be 95 MB or smaller."
                  : "The web build ZIP could not be uploaded.",
              ),
        );
        return;
      }
      next();
    });
  };
  const reserveWebBuildProcessor = (
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const release = acquireWebBuildProcessingSlot();
      res.once("finish", release);
      res.once("close", release);
      next();
    } catch (error) {
      next(error);
    }
  };

  router.post(
    "/web-builds",
    rateLimit(3, 60_000),
    authUser,
    getUser,
    reserveWebBuildProcessor,
    parseWebBuildUpload,
    asyncHandler(async (req, res) => {
      if (!req.file) throw new BadRequestError("Choose a ZIP file to upload.");
      try {
        const actor = requireRequestUser(res);
        await assertWebBuildQuota(actor.id, req.file.size);
        const scan = await scanWebBuildArchive(req.file.path);
        const build = await storeWebBuildArchive(req.file.path);
        try {
          await registerWebBuild({
            ownerId: actor.id,
            archiveBytes: req.file.size,
            scanned: scan.scanned,
            build,
          });
        } catch (error) {
          await deleteStoredWebBuild(build.buildId);
          throw error;
        }
        res.status(201).json(build);
      } finally {
        await fsPromises.rm(req.file.path, { force: true });
      }
    }),
  );

  router.post(
    "/import/itch/preview",
    rateLimit(),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, importItchGameSchema);
      res.json(await previewItchGame(input));
    }),
  );

  router.post(
    "/import/itch",
    rateLimit(),
    authUser,
    getUser,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, importItchGameSchema);
      const game = await importItchGame({
        actorUser: requireRequestUser(res),
        input,
        tenantId: res.locals.tenantId,
      });
      res.status(201).json(game);
    }),
  );

  router.post(
    "/",
    rateLimit(),
    authUser,
    getUser,
    getJam,
    getTargetTeam,
    assertJamPhaseIn([
      JAM_PHASES.jamming,
      JAM_PHASES.submission,
      JAM_PHASES.rating,
    ]),
    assertUserIsInTargetTeam,
    assertTargetTeamDoesNotHaveGame,
    asyncHandler(async (req, res) => {
      const input = parseBody(req, createGameSchema);
      const game = await createGame({
        actorUser: res.locals.user,
        jam: res.locals.jam,
        targetTeam: res.locals.targetTeam,
        input,
        tenantId: res.locals.tenantId,
      });

      res.status(201).json(game);
    }),
  );

  router.put(
    "/:gameSlug",
    authUser,
    getUser,
    getJam,
    asyncHandler(async (req, res) => {
      const { gameSlug } = parseParams(req, gameDetailParamsSchema);
      const body = parseBody(req, updateGameSchema);
      const grants = await loadAuthorizationGrants(res);
      const updatedGame = await updateGameBySlug({
        gameSlug,
        body,
        jamPhase: res.locals.jamPhase,
        actor: res.locals.user,
        grants,
      });

      res.json(updatedGame);
    }),
  );

  router.post(
    "/:gameSlug/post-jam",
    authUser,
    getUser,
    getJam,
    asyncHandler(async (req, res) => {
      const { gameSlug } = parseParams(req, gameDetailParamsSchema);
      const grants = await loadAuthorizationGrants(res);
      const game = await createPostJamPage(
        gameSlug,
        res.locals.user,
        grants,
      );
      res.json(game);
    }),
  );

  router.get(
    "/featured-videos",
    asyncHandler(async (req: Request, res: Response) => {
      const query = parseQuery(req, featuredGameVideosQuerySchema);
      const videos = await listFeaturedGameVideos({
        limit: query.limit,
        tenantId: res.locals.tenantId,
        jamId: query.jamId,
      });

      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      res.json(videos);
    }),
  );

  router.get(
    "/random",
    asyncHandler(async (req: Request, res: Response) => {
      const includeExternal = req.query.includeExternal !== "false";
      const game = await getRandomPublishedGame(
        res.locals.tenantId,
        includeExternal,
      );
      res.json({
        message:
          "Fetched random published game (active jam if exists, else any game)",
        data: game,
      });
    }),
  );

  router.get(
    "/:gameSlug/devlog",
    authUserOptional,
    getUserOptional,
    asyncHandler(async (req: Request, res: Response) => {
      const { gameSlug } = parseParams(req, gameDetailParamsSchema);
      const query = parseQuery(req, gameDevlogQuerySchema);
      res.json(await listGameDevlogPosts({
        gameSlug,
        input: query,
        tenantId: res.locals.tenantId,
      }));
    }),
  );

  router.get(
    "/:gameSlug",
    authUserOptional,
    getUserOptional,
    getJam,
    asyncHandler(async (req: Request, res: Response) => {
      const { gameSlug } = parseParams(req, gameDetailParamsSchema);
      const query = parseQuery(req, gameDetailQuerySchema);
      const game = await loadGameDetailResponse({
        gameSlug,
        jam: res.locals.jam,
        viewer: res.locals.user,
        tenantId: res.locals.tenantId,
        recap: query.recap,
        preview: query.preview,
      });

      if (!game) {
        throw new NotFoundError("Game not found");
      }

      res.json(game);
    }),
  );

  router.get(
    "/",
    authUserOptional,
    asyncHandler(async (req: Request, res: Response) => {
      const query = parseQuery(req, gameListingQuerySchema);
      const viewer = query.sort === "recommended" && res.locals.userSlug
        ? await db.user.findUnique({
            where: { slug: res.locals.userSlug },
            select: { id: true },
          })
        : null;
      const games = await listGames({
        sort: query.sort,
        jamId: query.jamId,
        jamSlug: query.jamSlug,
        externalJams: query.externalJams,
        pageVersion: parseListingPageVersion(query.pageVersion),
        cursor: query.cursor,
        limit: query.limit,
        tenantId: res.locals.tenantId,
        viewerId: viewer?.id,
      });

      // Listing freshness is managed by the server cache, which publishing invalidates.
      res.setHeader("Cache-Control", "no-store");
      const isPaginated =
        typeof req.query.cursor !== "undefined" || typeof req.query.limit !== "undefined";
      res.json(isPaginated ? games : games.items);
    }),
  );

  return router;
}
