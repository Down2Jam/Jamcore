import { Router } from "express";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = Router();

type RecapVisibilityPayload = {
  kind: "jam-recap-visibility";
  jamId: number;
  isPublic: boolean;
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

router.put("/", rateLimit(), authUser, getUser, async (req, res) => {
  const jamId = Number(req.body?.jamId);
  const isPublic = Boolean(req.body?.isPublic);

  if (!Number.isInteger(jamId)) {
    return res.status(400).json({ message: "Invalid jamId" });
  }

  const currentUserId = res.locals.user?.id;
  const currentUserSlug = res.locals.user?.slug;

  if (!currentUserId || !currentUserSlug) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const ownerGame = await db.game.findFirst({
    where: {
      jamId,
      published: true,
      team: {
        users: {
          some: {
            id: currentUserId,
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!ownerGame) {
    return res.status(400).json({
      message: "You need a published game in this jam to share a recap.",
    });
  }

  const existingRows = await db.data.findMany({
    where: {
      userId: currentUserId,
      gameId: ownerGame.id,
    },
    select: {
      id: true,
      data: true,
    },
  });

  const existing = existingRows.find((row) => {
    const payload = parseVisibilityPayload(row.data);
    return payload?.jamId === jamId;
  });

  const payload: RecapVisibilityPayload = {
    kind: "jam-recap-visibility",
    jamId,
    isPublic,
  };

  if (existing) {
    await db.data.update({
      where: { id: existing.id },
      data: {
        data: JSON.stringify(payload),
      },
    });
  } else {
    await db.data.create({
      data: {
        data: JSON.stringify(payload),
        userId: currentUserId,
        gameId: ownerGame.id,
      },
    });
  }

  return res.json({
    message: "Recap visibility updated",
    data: {
      jamId,
      isPublic,
      canEdit: true,
      sharePath: isPublic ? `/recap/${currentUserSlug}?jam=${jamId}` : null,
    },
  });
});

export default router;
