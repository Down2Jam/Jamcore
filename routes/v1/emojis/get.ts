import { Router } from "express";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";

const router = Router();

router.get("/", rateLimit(), async (_req, res) => {
  try {
    const emojis = await db.reaction.findMany({
      orderBy: { slug: "asc" },
      include: {
        artistUser: {
          select: {
            id: true,
            slug: true,
            name: true,
            profilePicture: true,
          },
        },
        ownerUser: {
          select: {
            id: true,
            slug: true,
            name: true,
            profilePicture: true,
          },
        },
        ownerGame: {
          select: {
            id: true,
            slug: true,
            pages: {
              where: { version: "JAM" },
              select: { name: true, thumbnail: true },
              take: 1,
            },
          },
        },
        uploaderUser: {
          select: {
            id: true,
            slug: true,
            name: true,
            profilePicture: true,
          },
        },
      },
    });

    res.json({
      message: "Emojis fetched",
      data: emojis.map((emoji) => ({
        ...emoji,
        ownerGame: emoji.ownerGame
          ? {
              ...emoji.ownerGame,
              name: emoji.ownerGame.pages?.[0]?.name ?? emoji.ownerGame.slug,
              thumbnail: emoji.ownerGame.pages?.[0]?.thumbnail ?? null,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch emojis", error);
    res.status(500).json({ message: "Failed to fetch emojis" });
  }
});

export default router;
