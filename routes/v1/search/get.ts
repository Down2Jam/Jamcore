import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { query, validationResult } from "express-validator";
import db from "@helper/db";
import { materializeGamePage } from "@helper/gamePages";
import { materializeTrackPage } from "@helper/trackPages";
import { PageVersion } from "@prisma/client";

const router = Router();

function pickPreferredGameVersion(game: { pages?: Array<{ version: PageVersion }> }) {
  return game.pages?.some((page) => page.version === PageVersion.POST_JAM)
    ? PageVersion.POST_JAM
    : PageVersion.JAM;
}

function compareByDisplayName(
  a: { name?: string | null },
  b: { name?: string | null },
) {
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

/**
 * Route to search the database for something
 */
router.get(
  "/",
  rateLimit(),

  query("query").notEmpty().isString().withMessage({
    message: "Please enter a valid search query",
  }),
  query("type").optional().isString().withMessage({
    message: "Please enter a valid search type",
  }),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { query: rawQuery, type } = req.query;
    const searchQuery =
      typeof rawQuery === "string" ? rawQuery.trim() : String(rawQuery ?? "").trim();

    const searchTypes = !type
      ? ["games", "users", "posts", "tracks", "teams"]
      : typeof type === "string"
        ? type.split("&")
        : [];

    const data: Record<string, any[]> = {};

    if (searchTypes.includes("games")) {
      const games = await db.game.findMany({
        where: {
          published: true,
          pages: {
            some: {
              name: {
                contains: searchQuery,
                mode: "insensitive",
              },
            },
          },
        },
        include: {
          pages: {
            where: {
              version: {
                in: [PageVersion.JAM, PageVersion.POST_JAM],
              },
            },
            include: {
              ratingCategories: true,
              majRatingCategories: true,
              tags: true,
              flags: true,
              downloadLinks: true,
              achievements: true,
              leaderboards: true,
              comments: true,
              tracks: true,
            },
          },
        },
        take: 8,
      });

      data.games = games
        .map((game) => materializeGamePage(game, pickPreferredGameVersion(game)))
        .sort(compareByDisplayName)
        .slice(0, 2);
    }

    if (searchTypes.includes("users")) {
      data.users = await db.user.findMany({
        where: {
          name: {
            contains: searchQuery,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          bannerPicture: true,
          profilePicture: true,
          short: true,
        },
        take: 2,
      });
    }

    if (searchTypes.includes("posts")) {
      data.posts = await db.post.findMany({
        where: {
          title: {
            contains: searchQuery,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          title: true,
          slug: true,
        },
        take: 2,
      });
    }

    if (searchTypes.includes("tracks")) {
      const tracks = await db.gamePageTrack.findMany({
        where: {
          name: {
            contains: searchQuery,
            mode: "insensitive",
          },
          gamePage: {
            version: {
              in: [PageVersion.JAM, PageVersion.POST_JAM],
            },
            game: {
              published: true,
            },
          },
        },
        include: {
          composer: {
            select: {
              id: true,
              name: true,
              slug: true,
              profilePicture: true,
              bannerPicture: true,
            },
          },
          gamePage: {
            include: {
              game: {
                include: {
                  pages: {
                    where: {
                      version: {
                        in: [PageVersion.JAM, PageVersion.POST_JAM],
                      },
                    },
                    include: {
                      ratingCategories: true,
                      majRatingCategories: true,
                      tags: true,
                      flags: true,
                      downloadLinks: true,
                      achievements: true,
                      leaderboards: true,
                      comments: true,
                      tracks: true,
                    },
                  },
                },
              },
            },
          },
          tags: {
            include: {
              category: true,
            },
          },
          flags: true,
          links: true,
          credits: {
            include: {
              user: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        take: 12,
      });

      const preferredTracks = new Map<string, (typeof tracks)[number]>();
      for (const track of tracks) {
        const existing = preferredTracks.get(track.slug);
        if (!existing || track.gamePage.version === PageVersion.POST_JAM) {
          preferredTracks.set(track.slug, track);
        }
      }

      data.tracks = [...preferredTracks.values()]
        .map((track) => materializeTrackPage(track))
        .sort(compareByDisplayName)
        .slice(0, 2);
    }

    if (searchTypes.includes("teams")) {
      data.teams = await db.team.findMany({
        where: {
          name: {
            contains: searchQuery,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          name: true,
        },
        take: 2,
      });
    }

    res.send({ message: "Data searched", data });
  },
);

export default router;
