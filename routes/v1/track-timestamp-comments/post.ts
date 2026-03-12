import express from "express";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import rateLimit from "@middleware/rateLimit";
import db from "@helper/db";

const router = express.Router();

router.post("/", rateLimit(), authUser, getUser, async (req, res) => {
  try {
    const { trackId, content, timestamp } = req.body;

    if (
      !trackId ||
      typeof content !== "string" ||
      !content.trim() ||
      typeof timestamp !== "number" ||
      Number.isNaN(timestamp) ||
      timestamp < 0
    ) {
      return res.status(400).json({ message: "Invalid timestamp comment." });
    }

    const track = await db.track.findUnique({
      where: { id: Number(trackId) },
      include: {
        game: {
          select: { published: true },
        },
      },
    });

    if (!track || !track.game?.published) {
      return res.status(404).json({ message: "Track not found" });
    }

    const created = await db.trackTimestampComment.create({
      data: {
        trackId: track.id,
        authorId: res.locals.user.id,
        content: content.trim(),
        timestamp,
      },
      include: {
        author: {
          select: {
            id: true,
            slug: true,
            name: true,
            profilePicture: true,
          },
        },
      },
    });

    return res.status(201).json({
      message: "Timestamp comment created",
      data: created,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Failed to create timestamp comment" });
  }
});

export default router;
