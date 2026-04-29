import { z } from "zod";

import db from "../../infra/db.js";
import {
  ForbiddenError,
  NotFoundError,
} from "../../lib/errors.js";
import { publishTrackUpdated } from "../federation/index.js";
import { parseTrackPageVersion } from "./page.js";
import { buildTrackWriteData } from "./write.js";

export const updateTrackSchema = z.object({
  name: z.string().trim().min(1).optional(),
  commentary: z.string().optional().nullable(),
  tagIds: z.array(z.number().int()).optional(),
  flagIds: z.array(z.number().int()).optional(),
  bpm: z.number().finite().optional().nullable(),
  musicalKey: z.string().optional().nullable(),
  softwareUsed: z.array(z.string()).optional(),
  links: z
    .array(
      z.object({
        label: z.string(),
        url: z.string(),
      }),
    )
    .optional(),
  credits: z
    .array(
      z.object({
        role: z.string(),
        userId: z.number().int(),
      }),
    )
    .optional(),
  composerId: z.number().int().optional().nullable(),
  allowDownload: z.boolean().optional(),
  allowBackgroundUse: z.boolean().optional(),
  allowBackgroundUseAttribution: z.boolean().optional(),
  license: z.string().optional().nullable(),
});

type TrackActor = {
  id: number;
};

export async function updateTrackBySlug({
  trackSlug,
  pageVersionInput,
  actor,
  input,
}: {
  trackSlug: string;
  pageVersionInput: unknown;
  actor: TrackActor;
  input: z.infer<typeof updateTrackSchema>;
}) {
  const pageVersion = parseTrackPageVersion(pageVersionInput);

  const track = await db.gamePageTrack.findFirst({
    where: {
      slug: trackSlug,
      gamePage: {
        version: pageVersion,
      },
    },
    include: {
      gamePage: {
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
      },
    },
  });

  if (!track) {
    throw new NotFoundError("Track not found");
  }

  const isTeamMember = track.gamePage.game.team.users.some(
    (member) => member.id === actor.id,
  );
  if (!isTeamMember) {
    throw new ForbiddenError("Not allowed to edit this track");
  }

  const trackData = buildTrackWriteData({
    name: typeof input.name === "string" ? input.name : track.name,
    slug: trackSlug,
    url: track.url,
    commentary: input.commentary,
    tagIds: input.tagIds,
    flagIds: input.flagIds,
    bpm: input.bpm,
    musicalKey: input.musicalKey,
    softwareUsed: input.softwareUsed,
    links: input.links,
    credits: input.credits,
    composerId: input.composerId,
    allowDownload: input.allowDownload,
    allowBackgroundUse: input.allowBackgroundUse,
    allowBackgroundUseAttribution: input.allowBackgroundUseAttribution,
    license: input.license,
  });

  const updated = await db.gamePageTrack.update({
    where: { id: track.id },
    data: {
      ...(typeof input.name === "string" ? { name: trackData.name } : {}),
      ...(typeof input.commentary === "string"
        ? { commentary: trackData.commentary }
        : {}),
      ...(typeof input.bpm === "number" && Number.isFinite(input.bpm)
        ? { bpm: trackData.bpm }
        : input.bpm === null
          ? { bpm: null }
          : {}),
      ...(typeof input.musicalKey === "string"
        ? { musicalKey: trackData.musicalKey }
        : input.musicalKey === null
          ? { musicalKey: null }
          : {}),
      ...(Array.isArray(input.softwareUsed)
        ? { softwareUsed: trackData.softwareUsed }
        : {}),
      ...(typeof input.allowDownload === "boolean"
        ? { allowDownload: trackData.allowDownload }
        : {}),
      ...(typeof input.allowBackgroundUse === "boolean"
        ? { allowBackgroundUse: trackData.allowBackgroundUse }
        : typeof input.license === "string" && input.license !== track.license
          ? { allowBackgroundUse: trackData.allowBackgroundUse }
          : {}),
      ...(typeof input.allowBackgroundUseAttribution === "boolean"
        ? {
            allowBackgroundUseAttribution:
              trackData.allowBackgroundUseAttribution,
          }
        : typeof input.license === "string" && input.license !== track.license
          ? {
              allowBackgroundUseAttribution:
                trackData.allowBackgroundUseAttribution,
            }
          : {}),
      ...(typeof input.license === "string" ? { license: trackData.license } : {}),
      ...(trackData.composerId ? { composerId: trackData.composerId } : {}),
      ...(Array.isArray(input.tagIds)
        ? {
            tags: {
              set: trackData.tagIds.map((id) => ({ id })),
            },
          }
        : {}),
      ...(Array.isArray(input.flagIds)
        ? {
            flags: {
              set: trackData.flagIds.map((id) => ({ id })),
            },
          }
        : {}),
      ...(Array.isArray(input.links)
        ? {
            links: {
              deleteMany: {},
              create: trackData.links,
            },
          }
        : {}),
      ...(Array.isArray(input.credits)
        ? {
            credits: {
              deleteMany: {},
              create: trackData.credits,
            },
          }
        : {}),
    },
    include: {
      composer: true,
      gamePage: {
        include: {
          game: {
            include: {
              jam: true,
              pages: true,
            },
          },
        },
      },
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

  await publishTrackUpdated(updated.slug);
  return updated;
}

