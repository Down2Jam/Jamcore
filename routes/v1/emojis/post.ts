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

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  assertUserAdmin,
  async (req, res) => {
    const { slug, image, artist, artistSlug, artistId } = req.body;

    if (!slug || !image) {
      res.status(400).json({ message: "Slug and image are required." });
      return;
    }

    const cleanSlug = sanitizeSlug(slug);
    if (!cleanSlug) {
      res.status(400).json({ message: "Invalid slug." });
      return;
    }

    try {
      const existing = await db.reaction.findUnique({
        where: { slug: cleanSlug },
      });

      if (existing) {
        res.status(409).json({ message: "Emoji slug already exists." });
        return;
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

      const emoji = await db.reaction.create({
        data: {
          slug: cleanSlug,
          image: image.trim(),
          artist: artist ? String(artist).trim() : null,
          artistId: resolvedArtistId,
          scopeType: "GLOBAL",
          uploaderId: res.locals.user.id,
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
        },
      });

      res.status(201).json({ message: "Emoji created", data: emoji });
    } catch (error) {
      console.error("Failed to create emoji", error);
      res.status(500).json({ message: "Failed to create emoji" });
    }
  }
);

export default router;
