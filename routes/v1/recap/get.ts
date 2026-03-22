import { Router } from "express";
import authUserOptional from "@middleware/authUserOptional";
import getUserOptional from "@middleware/getUserOptional";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

type RecapVisibilityPayload = {
  kind?: string;
  jamId?: number;
  isPublic?: boolean;
};

function parseVisibilityPayload(raw: string): RecapVisibilityPayload | null {
  try {
    const parsed = JSON.parse(raw) as RecapVisibilityPayload;
    if (parsed?.kind !== "jam-recap-visibility") return null;
    if (!Number.isInteger(parsed?.jamId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

router.get(
  "/",
  rateLimit(),
  authUserOptional,
  getUserOptional,
  async (req, res) => {
    const requestedSlug = String(req.query.userSlug ?? "").trim();
    const jamIdParam = Number(req.query.jamId);

    if (req.query.jamId != null && !Number.isInteger(jamIdParam)) {
      return res.status(400).json({ message: "Invalid jamId" });
    }

    const targetSlug = requestedSlug || res.locals.user?.slug;
    if (!targetSlug) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const targetUser = await db.user.findUnique({
      where: { slug: targetSlug },
      select: {
        id: true,
        slug: true,
        teams: {
          select: {
            jamId: true,
            game: {
              select: {
                id: true,
                jamId: true,
                published: true,
              },
            },
          },
        },
      },
    });

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const latestJamId =
      targetUser.teams
        .map((team) => team.game?.jamId ?? team.jamId)
        .filter((id): id is number => Number.isInteger(id))
        .sort((a, b) => b - a)[0] ??
      (
        await db.jam.findFirst({
          orderBy: { id: "desc" },
          select: { id: true },
        })
      )?.id;

    if (!latestJamId) {
      return res.json({
        data: {
          jamId: jamIdParam || null,
          isPublic: false,
          canEdit: res.locals.user?.slug === targetUser.slug,
          sharePath: null,
        },
      });
    }

    const jamId = jamIdParam || latestJamId;
    const ownerGame = targetUser.teams.find(
      (team) => team.game?.published && team.game.jamId === jamId,
    )?.game;

    const visibilityRows = ownerGame
      ? await db.data.findMany({
          where: {
            userId: targetUser.id,
            gameId: ownerGame.id,
          },
          select: {
            data: true,
          },
        })
      : [];

    const visibility = visibilityRows
      .map((row) => parseVisibilityPayload(row.data))
      .find((payload) => payload?.jamId === jamId);

    const isPublic = Boolean(visibility?.isPublic);
    const canEdit = res.locals.user?.slug === targetUser.slug;

    return res.json({
      data: {
        jamId,
        isPublic,
        canEdit,
        sharePath: isPublic ? `/recap/${targetUser.slug}?jam=${jamId}` : null,
      },
    });
  },
);

export default router;
