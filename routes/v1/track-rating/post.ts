import express from "express";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";
import db from "@helper/db";

const router = express.Router();
const DEFAULT_TRACK_CATEGORY = {
  name: "Overall",
  description: "Overall impression of the track",
  order: 0,
  always: true,
};

router.post("/", authUser, getUser, async (req, res) => {
  try {
    const { trackId, categoryId, value } = req.body;

    const track = await db.track.findUnique({
      where: { id: Number(trackId) },
      include: {
        game: {
          include: {
            team: {
              include: {
                users: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!track || !track.game?.published) {
      return res.status(404).json({ message: "Track not found" });
    }

    const category = await db.trackRatingCategory.findUnique({
      where: { id: Number(categoryId) },
      select: { id: true, name: true },
    });
    if (!category) {
      return res.status(404).json({ message: "Rating category not found" });
    }

    const isOwnTeam = track.game.team.users.some(
      (member) => member.id === res.locals.user.id,
    );
    if (isOwnTeam) {
      return res.status(403).json({ message: "You can't rate your own track." });
    }

    const existing = await db.trackRating.findFirst({
      where: {
        trackId: track.id,
        userId: res.locals.user.id,
        categoryId: category.id,
      },
    });

    if (existing) {
      await db.trackRating.update({
        where: { id: existing.id },
        data: { value },
      });
    } else {
      await db.trackRating.create({
        data: {
          trackId: track.id,
          userId: res.locals.user.id,
          categoryId: category.id,
          value,
        },
      });
    }

    return res.json({ message: "Track rating saved" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to save track rating" });
  }
});

export default router;
