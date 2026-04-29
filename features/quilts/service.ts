import { QuiltSubmissionStatus } from "@prisma/client";
import { z } from "zod";

import { appConfig } from "../../config/app.js";
import db from "../../infra/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../lib/errors.js";

const REVIEW_WINDOW_MS = 60 * 60 * 1000;
const MAX_PIXELS_PER_SUBMISSION = 4096;

export const quiltCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(1000).optional().nullable(),
  width: z.coerce.number().int().min(8).max(512),
  height: z.coerce.number().int().min(8).max(512),
  endsAt: z.coerce.date(),
});

const quiltPixelSchema = z.object({
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .transform((value) => value.toLowerCase())
    .nullable(),
});

export const quiltSubmissionSchema = z.object({
  pixels: z.array(quiltPixelSchema).min(1).max(MAX_PIXELS_PER_SUBMISSION),
});

export const quiltVoteSchema = z.object({
  value: z.coerce.number().int().refine((value) => value === 1 || value === -1),
});

export const quiltSlugParamsSchema = z.object({
  quiltSlug: z.string().trim().min(1),
});

export const quiltSubmissionParamsSchema = z.object({
  submissionId: z.coerce.number().int().positive(),
});

type QuiltActor = {
  id: number;
  slug: string;
  name: string;
  mod?: boolean | null;
  admin?: boolean | null;
};

type QuiltPixel = z.infer<typeof quiltPixelSchema>;

type QuiltSubmissionWithRelations = {
  id: number;
  pixels: unknown;
  status: QuiltSubmissionStatus;
  resolvesAt: Date;
  resolvedAt: Date | null;
  removedAt: Date | null;
  createdAt: Date;
  author: {
    id: number;
    slug: string;
    name: string;
    profilePicture: string | null;
  };
  votes: Array<{ userId: number; value: number }>;
};

function resolvedTenantId(tenantId?: string | null) {
  return tenantId ?? appConfig.platform.multiTenant.defaultTenantId;
}

function quiltTenantWhere(tenantId?: string | null) {
  const resolved = resolvedTenantId(tenantId);
  return { tenantId: resolved };
}

function assertAdmin(actor: QuiltActor) {
  if (!actor.admin && !actor.mod) {
    throw new ForbiddenError("Only moderators can manage quilts.");
  }
}

function parsePixels(value: unknown): QuiltPixel[] {
  const parsed = z.array(quiltPixelSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function scoreSubmission(submission: { votes: Array<{ value: number }> }) {
  return submission.votes.reduce((total, vote) => total + vote.value, 0);
}

function canonicalPixels(pixels: QuiltPixel[]) {
  return JSON.stringify(
    pixels
      .map((pixel) => ({
        x: pixel.x,
        y: pixel.y,
        color: pixel.color,
      }))
      .sort((a, b) => a.y - b.y || a.x - b.x),
  );
}

function serializeSubmission(
  submission: QuiltSubmissionWithRelations,
  viewerId?: number,
) {
  return {
    id: submission.id,
    pixels: parsePixels(submission.pixels),
    status: submission.status,
    score: scoreSubmission(submission),
    viewerVote:
      submission.votes.find((vote) => vote.userId === viewerId)?.value ?? 0,
    resolvesAt: submission.resolvesAt.toISOString(),
    resolvedAt: submission.resolvedAt?.toISOString() ?? null,
    removedAt: submission.removedAt?.toISOString() ?? null,
    createdAt: submission.createdAt.toISOString(),
    author: submission.author,
  };
}

function composeCanvas(
  width: number,
  height: number,
  submissions: Array<{ id: number; pixels: unknown }>,
) {
  const stacks = Array.from({ length: width * height }, () => [] as string[]);

  for (const submission of submissions) {
    for (const pixel of parsePixels(submission.pixels)) {
      if (pixel.x < 0 || pixel.x >= width || pixel.y < 0 || pixel.y >= height) {
        continue;
      }
      const index = pixel.y * width + pixel.x;
      if (pixel.color === null) {
        stacks[index].pop();
      } else {
        stacks[index].push(pixel.color);
      }
    }
  }

  return stacks.map((stack) => stack.at(-1) ?? null);
}

async function resolveDueSubmissions(quiltId: number) {
  const due = await db.quiltSubmission.findMany({
    where: {
      quiltId,
      status: QuiltSubmissionStatus.PENDING,
      resolvesAt: { lte: new Date() },
    },
    include: { votes: { select: { value: true } } },
  });

  for (const submission of due) {
    await db.quiltSubmission.update({
      where: { id: submission.id },
      data: {
        status:
          scoreSubmission(submission) < 0
            ? QuiltSubmissionStatus.REJECTED
            : QuiltSubmissionStatus.ACCEPTED,
        resolvedAt: new Date(),
      },
    });
  }
}

async function getQuiltOrThrow(slug: string, tenantId?: string | null) {
  const quilt = await db.quilt.findFirst({
    where: { slug, ...quiltTenantWhere(tenantId) },
  });
  if (!quilt) {
    throw new NotFoundError("Quilt not found.");
  }
  return quilt;
}

export async function listQuilts(tenantId?: string | null) {
  const quiltIds = await db.quilt.findMany({
    where: quiltTenantWhere(tenantId),
    select: { id: true },
  });
  for (const quilt of quiltIds) {
    await resolveDueSubmissions(quilt.id);
  }

  const quilts = await db.quilt.findMany({
    where: quiltTenantWhere(tenantId),
    orderBy: [{ endsAt: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { submissions: true } },
      submissions: {
        where: { status: QuiltSubmissionStatus.ACCEPTED },
        select: { id: true },
      },
    },
  });

  return quilts.map((quilt) => ({
    id: quilt.id,
    slug: quilt.slug,
    name: quilt.name,
    description: quilt.description,
    width: quilt.width,
    height: quilt.height,
    endsAt: quilt.endsAt.toISOString(),
    createdAt: quilt.createdAt.toISOString(),
    submissionCount: quilt._count.submissions,
    acceptedCount: quilt.submissions.length,
  }));
}

export async function createQuilt({
  input,
  actor,
  tenantId,
}: {
  input: z.infer<typeof quiltCreateSchema>;
  actor: QuiltActor;
  tenantId?: string | null;
}) {
  assertAdmin(actor);
  const quilt = await db.quilt.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description?.trim() || null,
      width: input.width,
      height: input.height,
      endsAt: input.endsAt,
      tenantId: resolvedTenantId(tenantId),
    },
  });
  return quilt;
}

export async function getQuiltDetail({
  slug,
  actor,
  tenantId,
}: {
  slug: string;
  actor?: QuiltActor | null;
  tenantId?: string | null;
}) {
  const quilt = await getQuiltOrThrow(slug, tenantId);
  await resolveDueSubmissions(quilt.id);

  const submissions = await db.quiltSubmission.findMany({
    where: { quiltId: quilt.id },
    orderBy: { createdAt: "asc" },
    include: {
      author: {
        select: { id: true, slug: true, name: true, profilePicture: true },
      },
      votes: { select: { userId: true, value: true } },
    },
  });
  const activeAccepted = submissions.filter(
    (submission) => submission.status === QuiltSubmissionStatus.ACCEPTED,
  );

  return {
    id: quilt.id,
    slug: quilt.slug,
    name: quilt.name,
    description: quilt.description,
    width: quilt.width,
    height: quilt.height,
    endsAt: quilt.endsAt.toISOString(),
    createdAt: quilt.createdAt.toISOString(),
    isEnded: quilt.endsAt.getTime() <= Date.now(),
    canvas: composeCanvas(quilt.width, quilt.height, activeAccepted),
    history: activeAccepted.map((submission) =>
      serializeSubmission(submission, actor?.id),
    ),
    pending: submissions
      .filter((submission) => submission.status === QuiltSubmissionStatus.PENDING)
      .map((submission) => serializeSubmission(submission, actor?.id)),
    rejected: submissions
      .filter((submission) => submission.status === QuiltSubmissionStatus.REJECTED)
      .map((submission) => serializeSubmission(submission, actor?.id)),
    removed: submissions
      .filter((submission) => submission.status === QuiltSubmissionStatus.REMOVED)
      .map((submission) => serializeSubmission(submission, actor?.id)),
  };
}

export async function submitQuiltPixels({
  slug,
  input,
  actor,
  tenantId,
}: {
  slug: string;
  input: z.infer<typeof quiltSubmissionSchema>;
  actor: QuiltActor;
  tenantId?: string | null;
}) {
  const quilt = await getQuiltOrThrow(slug, tenantId);
  if (quilt.endsAt.getTime() <= Date.now()) {
    throw new BadRequestError("This quilt has ended.");
  }
  const unique = new Map<string, QuiltPixel>();
  for (const pixel of input.pixels) {
    if (pixel.x >= quilt.width || pixel.y >= quilt.height) {
      throw new BadRequestError("Pixel is outside the quilt bounds.");
    }
    unique.set(`${pixel.x}:${pixel.y}`, pixel);
  }

  const normalizedPixels = Array.from(unique.values());
  const existingPending = await db.quiltSubmission.findMany({
    where: {
      quiltId: quilt.id,
      authorId: actor.id,
      status: QuiltSubmissionStatus.PENDING,
    },
    select: { pixels: true },
  });
  const normalized = canonicalPixels(normalizedPixels);
  if (
    existingPending.some(
      (submission) => canonicalPixels(parsePixels(submission.pixels)) === normalized,
    )
  ) {
    throw new BadRequestError(
      "You already submitted this quilt change. Edit the existing submission to update it.",
    );
  }
  const now = new Date();
  const submission = await db.quiltSubmission.create({
    data: {
      quiltId: quilt.id,
      authorId: actor.id,
      pixels: normalizedPixels,
      resolvesAt: new Date(now.getTime() + REVIEW_WINDOW_MS),
    },
  });

  return getQuiltDetail({ slug, actor, tenantId });
}

export async function updateQuiltSubmission({
  submissionId,
  input,
  actor,
  tenantId,
}: {
  submissionId: number;
  input: z.infer<typeof quiltSubmissionSchema>;
  actor: QuiltActor;
  tenantId?: string | null;
}) {
  const submission = await db.quiltSubmission.findFirst({
    where: {
      id: submissionId,
      status: QuiltSubmissionStatus.PENDING,
      quilt: quiltTenantWhere(tenantId),
    },
    select: {
      id: true,
      authorId: true,
      quilt: {
        select: {
          id: true,
          slug: true,
          width: true,
          height: true,
          endsAt: true,
        },
      },
    },
  });
  if (!submission) {
    throw new NotFoundError("Pending quilt submission not found.");
  }
  if (submission.authorId !== actor.id) {
    throw new ForbiddenError("You can only edit your own pending quilt submission.");
  }
  if (submission.quilt.endsAt.getTime() <= Date.now()) {
    throw new BadRequestError("This quilt has ended.");
  }

  const unique = new Map<string, QuiltPixel>();
  for (const pixel of input.pixels) {
    if (pixel.x >= submission.quilt.width || pixel.y >= submission.quilt.height) {
      throw new BadRequestError("Pixel is outside the quilt bounds.");
    }
    unique.set(`${pixel.x}:${pixel.y}`, pixel);
  }

  const now = new Date();
  await db.$transaction([
    db.quiltVote.deleteMany({ where: { submissionId } }),
    db.quiltSubmission.update({
      where: { id: submissionId },
      data: {
        pixels: Array.from(unique.values()),
        resolvesAt: new Date(now.getTime() + REVIEW_WINDOW_MS),
        resolvedAt: null,
        updatedAt: now,
      },
    }),
  ]);

  return getQuiltDetail({ slug: submission.quilt.slug, actor, tenantId });
}

export async function voteQuiltSubmission({
  submissionId,
  input,
  actor,
  tenantId,
}: {
  submissionId: number;
  input: z.infer<typeof quiltVoteSchema>;
  actor: QuiltActor;
  tenantId?: string | null;
}) {
  const submission = await db.quiltSubmission.findFirst({
    where: {
      id: submissionId,
      status: QuiltSubmissionStatus.PENDING,
      quilt: quiltTenantWhere(tenantId),
    },
    select: {
      id: true,
      quilt: { select: { slug: true, endsAt: true } },
      authorId: true,
      resolvesAt: true,
    },
  });
  if (!submission) {
    throw new NotFoundError("Pending quilt submission not found.");
  }
  if (submission.quilt.endsAt.getTime() <= Date.now()) {
    throw new BadRequestError("This quilt has ended.");
  }
  if (submission.resolvesAt.getTime() <= Date.now()) {
    const quilt = await db.quiltSubmission.findUnique({
      where: { id: submission.id },
      select: { quiltId: true },
    });
    if (quilt) {
      await resolveDueSubmissions(quilt.quiltId);
    }
    throw new BadRequestError("This submission has already been resolved.");
  }

  await db.quiltVote.upsert({
    where: { submissionId_userId: { submissionId, userId: actor.id } },
    create: { submissionId, userId: actor.id, value: input.value },
    update: { value: input.value },
  });

  return getQuiltDetail({ slug: submission.quilt.slug, actor, tenantId });
}

export async function removeQuiltSubmission({
  submissionId,
  actor,
  tenantId,
}: {
  submissionId: number;
  actor: QuiltActor;
  tenantId?: string | null;
}) {
  assertAdmin(actor);
  const submission = await db.quiltSubmission.findFirst({
    where: {
      id: submissionId,
      quilt: quiltTenantWhere(tenantId),
    },
    select: { id: true, quilt: { select: { slug: true } } },
  });
  if (!submission) {
    throw new NotFoundError("Quilt submission not found.");
  }

  await db.quiltSubmission.update({
    where: { id: submissionId },
    data: {
      status: QuiltSubmissionStatus.REMOVED,
      removedAt: new Date(),
      removedById: actor.id,
    },
  });

  return getQuiltDetail({ slug: submission.quilt.slug, actor, tenantId });
}
