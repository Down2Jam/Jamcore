import { Router } from "express";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import assertUserAdmin from "@middleware/assertUserAdmin";

const router = Router();

const sanitizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 50);

router.put(
  "/:id",
  rateLimit(),
  authUser,
  getUser,
  assertUserAdmin,
  async (req, res) => {
    const { id } = req.params;
    const {
      slug,
      image,
      artist,
      artistSlug,
      artistId,
      scopeUserId,
      scopeGameId,
    } = req.body;

    const reactionId = Number(id);
    if (!reactionId) {
      res.status(400).json({ message: "Emoji id is required." });
      return;
    }

    const cleanSlug = slug ? sanitizeSlug(slug) : null;
    if (slug && !cleanSlug) {
      res.status(400).json({ message: "Invalid slug." });
      return;
    }

    try {
      const existingEmoji = await db.reaction.findUnique({
        where: { id: reactionId },
        select: {
          id: true,
          scopeType: true,
          scopeUserId: true,
          scopeGameId: true,
        },
      });
      if (!existingEmoji) {
        res.status(404).json({ message: "Emoji not found." });
        return;
      }

      const isAdmin = Boolean(res.locals.user?.admin);
      let isOwner = false;

      if (existingEmoji.scopeType === "USER" && existingEmoji.scopeUserId) {
        isOwner = existingEmoji.scopeUserId === res.locals.user?.id;
      }

      if (existingEmoji.scopeType === "GAME" && existingEmoji.scopeGameId) {
        const game = await db.game.findUnique({
          where: { id: existingEmoji.scopeGameId },
          include: { pages: true, team: { include: { users: true } } },
        });
        if (game) {
          isOwner = game.team.users.some(
            (user) => user.id === res.locals.user?.id
          );
        }
      }

      if (!isAdmin) {
        if (existingEmoji.scopeType === "GLOBAL" || !isOwner) {
          res.status(403).json({ message: "Not allowed to edit this emoji." });
          return;
        }
      }
      const existing = await db.reaction.findUnique({
        where: { id: reactionId },
      });
      if (!existing) {
        res.status(404).json({ message: "Emoji not found." });
        return;
      }

      if (cleanSlug && cleanSlug !== existing.slug) {
        const conflict = await db.reaction.findUnique({
          where: { slug: cleanSlug },
        });
        if (conflict) {
          res.status(409).json({ message: "Emoji slug already exists." });
          return;
        }
      }

      let resolvedArtistId: number | null = null;
      if (artistId) {
        const artistUser = await db.user.findUnique({
          where: { id: Number(artistId) },
          select: { id: true },
        });
        if (!artistUser) {
          res.status(404).json({ message: "Artist user not found." });
          return;
        }
        resolvedArtistId = artistUser.id;
      } else if (artistSlug) {
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

      let scopeTypeUpdate: "GLOBAL" | "USER" | "GAME" | undefined;
      if (scopeUserId !== undefined && scopeUserId) {
        scopeTypeUpdate = "USER";
      } else if (scopeGameId !== undefined && scopeGameId) {
        scopeTypeUpdate = "GAME";
      } else if (scopeUserId !== undefined || scopeGameId !== undefined) {
        scopeTypeUpdate = "GLOBAL";
      }

      const updated = await db.reaction.update({
        where: { id: reactionId },
        data: {
          ...(cleanSlug ? { slug: cleanSlug } : {}),
          ...(image ? { image: String(image).trim() } : {}),
          artist: artist ? String(artist).trim() : null,
          artistId: resolvedArtistId,
          uploaderId: res.locals.user.id,
          ...(scopeUserId !== undefined
            ? { scopeUserId: scopeUserId ? Number(scopeUserId) : null }
            : {}),
          ...(scopeGameId !== undefined
            ? { scopeGameId: scopeGameId ? Number(scopeGameId) : null }
            : {}),
          ...(scopeTypeUpdate ? { scopeType: scopeTypeUpdate } : {}),
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
        },
      });
      res.json({
        message: "Emoji updated",
        data: {
          ...updated,
          ownerGame: updated.ownerGame
            ? {
                ...updated.ownerGame,
                name: updated.ownerGame.pages?.[0]?.name ?? updated.ownerGame.slug,
                thumbnail: updated.ownerGame.pages?.[0]?.thumbnail ?? null,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("Failed to update emoji", error);
      res.status(500).json({ message: "Failed to update emoji" });
    }
  }
);

export default router;
