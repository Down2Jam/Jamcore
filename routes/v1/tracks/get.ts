import express from "express";
import db from "@helper/db";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const jamIdParam = (req.query.jamId as string | undefined)?.trim();

    if (
      jamIdParam &&
      jamIdParam !== "all" &&
      Number.isNaN(Number(jamIdParam))
    ) {
      return res.status(400).json({ message: "Invalid jamId" });
    }

    const where = {
      game: {
        published: true,
        ...(jamIdParam && jamIdParam !== "all"
          ? { jamId: Number(jamIdParam) }
          : {}),
      },
    };

    const tracks = await db.track.findMany({
      where,
      include: {
        composer: true,
        game: true,
      },
    });

    res.json({
      message:
        jamIdParam && jamIdParam !== "all"
          ? `Fetched tracks for jam ${jamIdParam}`
          : "Fetched tracks",
      data: tracks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch tracks" });
  }
});

export default router;
