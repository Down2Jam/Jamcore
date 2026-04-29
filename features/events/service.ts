import { parseZonedDateTime } from "@internationalized/date";
import { z } from "zod";

import db from "../../infra/db.js";

const firstQueryValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

export const createEventSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().optional(),
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
  link: z.string().optional(),
  icon: z.string().optional(),
});

export const listEventsQuerySchema = z.object({
  filter: z.preprocess(
    firstQueryValue,
    z.enum(["upcoming", "current", "past"]).optional(),
  ),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function buildUniqueEventSlug(title: string) {
  const slugBase = slugify(title);
  let slug = slugBase;
  let count = 1;

  while (true) {
    const existingEvent = await db.event.findUnique({
      where: { slug },
    });

    if (!existingEvent) {
      return slug;
    }

    count += 1;
    slug = `${slugBase}-${count}`;
  }
}

export async function createEvent({
  title,
  content,
  start,
  end,
  link,
  icon,
  hostId,
}: z.infer<typeof createEventSchema> & { hostId: number }) {
  const slug = await buildUniqueEventSlug(title);

  return db.event.create({
    data: {
      name: title,
      slug,
      content: content ? content : null,
      startTime: parseZonedDateTime(start).toDate(),
      endTime: parseZonedDateTime(end).toDate(),
      hostId,
      categoryId: 1,
      link: link ? link : null,
      icon: icon ? icon : null,
    },
  });
}

export async function listEvents({
  filter = "current",
}: z.infer<typeof listEventsQuerySchema>) {
  const now = new Date();

  const where =
    filter === "upcoming"
      ? { startTime: { gt: now } }
      : filter === "past"
        ? { endTime: { lte: now } }
        : {
            endTime: { gt: now },
            startTime: { lte: now },
          };

  return db.event.findMany({
    where,
    orderBy: { startTime: "asc" },
    include: {
      host: true,
    },
  });
}

