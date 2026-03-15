import express from "express";
import db from "@helper/db";
import rateLimit from "@middleware/rateLimit";
import authUser from "@middleware/authUser";
import getUser from "@middleware/getUser";

const router = express.Router();

const backgroundUsageAllowedByDefault = (license?: string | null) => {
  const normalized = (license ?? "").toUpperCase().replace(/\s+/g, " ").trim();

  return normalized === "CC0" || normalized === "CC BY";
};

const backgroundUsageAttributionAllowedByDefault = (
  license?: string | null,
) => {
  const normalized = (license ?? "").toUpperCase().replace(/\s+/g, " ").trim();

  return normalized !== "CC0";
};

router.put("/:trackSlug", rateLimit(), authUser, getUser, async (req, res) => {
  try {
    const { trackSlug } = req.params;
    const {
      name,
      commentary,
      tagIds,
      flagIds,
      bpm,
      musicalKey,
      softwareUsed,
      links,
      credits,
      composerId,
      allowDownload,
      allowBackgroundUse,
      allowBackgroundUseAttribution,
      license,
    } = req.body;

    const normalizedCredits = Array.isArray(credits)
      ? credits
          .map((credit: { role?: string; userId?: number | string }) => ({
            role: String(credit?.role ?? "").trim(),
            userId: Number(credit?.userId),
          }))
          .filter(
            (credit) =>
              credit.role.length > 0 && Number.isInteger(credit.userId),
          )
      : null;

    const primaryCreditUserId =
      normalizedCredits?.find(
        (credit) => credit.role.trim().toLowerCase() === "composer",
      )?.userId ??
      normalizedCredits?.find((credit) => Number.isInteger(credit.userId))
        ?.userId ??
      (typeof composerId === "number" && Number.isInteger(composerId)
        ? composerId
        : null);

    const track = await db.track.findUnique({
      where: { slug: trackSlug },
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

    if (!track) {
      return res.status(404).json({ message: "Track not found" });
    }

    const isTeamMember = track.game.team.users.some(
      (member) => member.id === res.locals.user.id,
    );
    if (!isTeamMember) {
      return res.status(403).json({ message: "Not allowed to edit this track" });
    }

    const updated = await db.track.update({
      where: { id: track.id },
      data: {
        ...(typeof name === "string" ? { name: name.trim() } : {}),
        ...(typeof commentary === "string" ? { commentary } : {}),
        ...(typeof bpm === "number" && Number.isFinite(bpm)
          ? { bpm: Math.max(1, Math.floor(bpm)) }
          : bpm === null
            ? { bpm: null }
            : {}),
        ...(typeof musicalKey === "string"
          ? { musicalKey: musicalKey.trim() || null }
          : musicalKey === null
            ? { musicalKey: null }
            : {}),
        ...(Array.isArray(softwareUsed)
          ? {
              softwareUsed: softwareUsed
                .map((value: string) => String(value).trim())
                .filter(Boolean),
            }
          : {}),
        ...(typeof allowDownload === "boolean" ? { allowDownload } : {}),
        ...(typeof allowBackgroundUse === "boolean"
          ? { allowBackgroundUse }
          : typeof license === "string" && license !== track.license
            ? {
                allowBackgroundUse: backgroundUsageAllowedByDefault(license),
              }
            : {}),
        ...(typeof allowBackgroundUseAttribution === "boolean"
          ? { allowBackgroundUseAttribution }
          : typeof license === "string" && license !== track.license
            ? {
                allowBackgroundUseAttribution:
                  backgroundUsageAttributionAllowedByDefault(license),
              }
            : {}),
        ...(typeof license === "string" ? { license: license || null } : {}),
        ...(primaryCreditUserId ? { composerId: primaryCreditUserId }
          : {}),
        ...(Array.isArray(tagIds)
          ? {
              tags: {
                set: tagIds
                  .map((id: number | string) => Number(id))
                  .filter((id: number) => Number.isInteger(id))
                  .map((id: number) => ({ id })),
              },
            }
          : {}),
        ...(Array.isArray(flagIds)
          ? {
              flags: {
                set: flagIds
                  .map((id: number | string) => Number(id))
                  .filter((id: number) => Number.isInteger(id))
                  .map((id: number) => ({ id })),
              },
            }
          : {}),
        ...(Array.isArray(links)
          ? {
              links: {
                deleteMany: {},
                create: links
                  .map((link: { label?: string; url?: string }) => ({
                    label: String(link?.label ?? "").trim(),
                    url: String(link?.url ?? "").trim(),
                  }))
                  .filter((link) => link.label && link.url),
              },
            }
          : {}),
        ...(Array.isArray(credits)
          ? {
              credits: {
                deleteMany: {},
                create: normalizedCredits ?? [],
              },
            }
          : {}),
      },
      include: {
        composer: true,
        game: true,
        flags: true,
        links: true,
        credits: {
          include: {
            user: true,
          },
        },
        tags: {
          include: {
            category: true,
          },
        },
      },
    });

    return res.json({ message: "Track updated", data: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to update track" });
  }
});

export default router;
