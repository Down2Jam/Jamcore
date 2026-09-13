import type { GameViewer } from "../../types/game.js";

export function canInspectUnpublishedGames(viewer?: GameViewer | null) {
  return Boolean(viewer?.id && viewer.admin && viewer.slug === "ategon");
}

export function canReadGame(game: { published: boolean; team?: { users: { id: number }[] } | null }, viewer?: GameViewer | null) {
  return game.published || canInspectUnpublishedGames(viewer) ||
    Boolean(viewer?.id && game.team?.users.some((member) => member.id === viewer.id));
}
