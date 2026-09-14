import db from "../../infra/db.js";
import { filterCoreEntityIdsByTenant } from "../../infra/coreTenantStore.js";
import { BadRequestError } from "../../lib/errors.js";

export async function listLinkableGames(authorId: number, tenantId?: string | null) {
  const games = await db.game.findMany({
    where: { published: true, team: { OR: [{ ownerId: authorId }, { users: { some: { id: authorId } } }] } },
    select: { id: true, slug: true, pages: { select: { version: true, name: true, thumbnail: true } } },
    orderBy: { id: "desc" },
  });
  const allowed = new Set(await filterCoreEntityIdsByTenant({ entityType: "Game", ids: games.map(game => game.id), tenantId }));
  return games.filter(game => allowed.has(game.id)).map(game => {
    const page = game.pages.find(page => page.version === "POST_JAM") ?? game.pages.find(page => page.version === "JAM");
    return { gameId: game.id, slug: game.slug, name: page?.name ?? game.slug, thumbnail: page?.thumbnail ?? null };
  });
}

export async function validatePostGames(authorId: number, links: Array<{ gameId: number }> | undefined, tenantId?: string | null) {
  if (!links?.length) return;
  const allowed = new Set((await listLinkableGames(authorId, tenantId)).map(game => game.gameId));
  if (links.some(link => !allowed.has(link.gameId))) {
    throw new BadRequestError("You can only link published games made by the post's author.");
  }
}

export async function loadLinkedGames(postIds: number[], tenantId?: string | null) {
  if (!postIds.length) return new Map<number, Array<{ gameId: number; slug: string; name: string; thumbnail: string | null; relationType: string }>>();
  const links = await db.postGameLink.findMany({ where: { postId: { in: postIds } }, orderBy: { createdAt: "asc" } });
  const games = await db.game.findMany({
    where: { id: { in: links.map(link => link.gameId) }, published: true },
    select: { id: true, slug: true, pages: { select: { version: true, name: true, thumbnail: true } } },
  });
  const allowed = new Set(await filterCoreEntityIdsByTenant({ entityType: "Game", ids: games.map(game => game.id), tenantId }));
  const byId = new Map(games.filter(game => allowed.has(game.id)).map(game => [game.id, game]));
  const result = new Map<number, Array<{ gameId: number; slug: string; name: string; thumbnail: string | null; relationType: string }>>();
  for (const link of links) {
    const game = byId.get(link.gameId);
    if (!game) continue;
    const page = game.pages.find(page => page.version === "POST_JAM") ?? game.pages.find(page => page.version === "JAM");
    const entries = result.get(link.postId) ?? [];
    entries.push({ gameId: game.id, slug: game.slug, name: page?.name ?? game.slug, thumbnail: page?.thumbnail ?? null, relationType: link.relationType });
    result.set(link.postId, entries);
  }
  return result;
}
