import { Router } from "express";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import { getJamPage } from "@helper/gamePages";

const router = Router();

const sanitizeSlug = (value: string, maxLength: number) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, maxLength);

const MIN_PREFIX_LENGTH = 4;
const MAX_PREFIX_LENGTH = 8;
const DEFAULT_PREFIX_LENGTH = 6;

const generatePrefix = (seed?: string | null): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const normalizedSeed = (seed ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    normalizedSeed.length >= MIN_PREFIX_LENGTH &&
    normalizedSeed.length <= MAX_PREFIX_LENGTH
  ) {
    return normalizedSeed;
  }

  let prefix = normalizedSeed.slice(0, DEFAULT_PREFIX_LENGTH);
  for (let i = prefix.length; i < DEFAULT_PREFIX_LENGTH; i += 1) {
    prefix += chars[Math.floor(Math.random() * chars.length)];
  }
  return prefix;
};

router.post("/:gameSlug", rateLimit(), authUser, getUser, async (req, res) => {
  const { gameSlug } = req.params;
  const { slug, image, artistSlug } = req.body;

  if (!slug || !image) {
    res.status(400).json({ message: "Slug and image are required." });
    return;
  }

  try {
    const userId = res.locals.user.id;
    const game = await db.game.findUnique({
      where: { slug: gameSlug },
      include: {
        pages: true,
        team: {
          include: {
            users: true,
          },
        },
      },
    });
    if (!game) {
      res.status(404).json({ message: "Game not found." });
      return;
    }

    const isMember = game.team.users.some((user) => user.id === userId);
    if (!isMember) {
      res.status(403).json({ message: "Not allowed to add game emojis." });
      return;
    }

    const jamPage = getJamPage(game);
    const prefix = jamPage?.emotePrefix ?? generatePrefix(game.slug);
    if (jamPage && !jamPage.emotePrefix) {
      await db.gamePage.update({
        where: { id: jamPage.id },
        data: { emotePrefix: prefix },
      });
    }

    const baseSlug = sanitizeSlug(String(slug), 44);
    if (!baseSlug) {
      res.status(400).json({ message: "Invalid slug." });
      return;
    }

    const fullSlug = `${prefix}${baseSlug}`;
    const existing = await db.reaction.findUnique({
      where: { slug: fullSlug },
    });
    if (existing) {
      res.status(409).json({ message: "Emoji slug already exists." });
      return;
    }

    let resolvedArtistId: number | null = null;
    if (artistSlug) {
      const artistUser = await db.user.findUnique({
        where: { slug: String(artistSlug) },
        select: { id: true },
      });
      if (!artistUser) {
        res.status(404).json({ message: "Artist user not found." });
        return;
      }
      resolvedArtistId = artistUser.id;
    }

    const emoji = await db.reaction.create({
      data: {
        slug: fullSlug,
        image: String(image).trim(),
        artistId: resolvedArtistId,
        uploaderId: userId,
        scopeType: "GAME",
        scopeGameId: game.id,
      },
      include: {
        artistUser: {
          select: {
            id: true,
            slug: true,
            name: true,
            profilePicture: true,
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
      },
    });
    res.status(201).json({
      message: "Emoji created",
      data: {
        ...emoji,
        ownerGame: emoji.ownerGame
          ? {
              ...emoji.ownerGame,
              name: emoji.ownerGame.pages?.[0]?.name ?? emoji.ownerGame.slug,
              thumbnail: emoji.ownerGame.pages?.[0]?.thumbnail ?? null,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Failed to create game emoji", error);
    res.status(500).json({ message: "Failed to create emoji" });
  }
});

export default router;
