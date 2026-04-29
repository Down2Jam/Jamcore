import { z } from "zod";

import db from "../../infra/db.js";

const firstQueryValue = (value: unknown) =>
  Array.isArray(value) ? value[0] : value;

export const ratingCategoriesQuerySchema = z.object({
  always: z.preprocess(firstQueryValue, z.string().trim().optional()),
});

export async function listFlags() {
  return db.flag.findMany({});
}

export async function listTrackFlags() {
  return db.trackFlag.findMany({
    orderBy: { name: "asc" },
  });
}

export async function listPostTags() {
  return db.tag.findMany({
    orderBy: { name: "asc" },
    include: { category: true },
    where: {
      postTag: true,
    },
  });
}

export async function listGameTags() {
  return db.tag.findMany({
    orderBy: { name: "asc" },
    include: { category: true },
    where: {
      gameTag: true,
    },
  });
}

export async function listTrackTags() {
  return db.trackTag.findMany({
    orderBy: [{ category: { priority: "desc" } }, { name: "asc" }],
    include: {
      category: true,
    },
  });
}

export async function listRatingCategories({
  always,
}: z.infer<typeof ratingCategoriesQuerySchema>) {
  return db.ratingCategory.findMany({
    where: {
      always: always === "true",
    },
    orderBy: [{ order: "desc" }, { id: "asc" }],
  });
}

export async function listTrackRatingCategories() {
  return db.trackRatingCategory.findMany({
    orderBy: [{ order: "desc" }, { id: "asc" }],
  });
}

export async function listTeamRoles() {
  return db.teamRole.findMany();
}

