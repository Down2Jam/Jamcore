import db from "../../infra/db.js";

export async function listUserCards({
  cursor,
  limit = 20,
}: {
  cursor?: string;
  limit?: number;
}) {
  const cursorId = cursor && /^\d+$/.test(cursor) ? Number.parseInt(cursor, 10) : undefined;
  return db.user.findMany({
    orderBy: {
      id: "desc",
    },
    ...(cursorId
      ? {
          cursor: { id: cursorId },
          skip: 1,
        }
      : {}),
    take: limit + 1,
    select: {
      id: true,
      name: true,
      profilePicture: true,
      slug: true,
      teams: {
        select: {
          game: {
            select: {
              published: true,
            },
          },
        },
      },
    },
  });
}

export async function searchUserCards(query: string) {
  return db.user.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      profilePicture: true,
    },
    take: 5,
  });
}
