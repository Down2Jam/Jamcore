import type { materializeGameListingEntries } from "./presenters.js";

type ListedGame = ReturnType<typeof materializeGameListingEntries>[number];

// Ranking needs users' activity and raters' teams. Cards only need membership
// IDs and rating records. Project AFTER sorting; never mutate ranking inputs.
export function toGameListingResponse(game: ListedGame) {
  const compactRatings = (ratings: ListedGame["ratings"]) =>
    ratings.map(({ user: _user, ...rating }) => rating);

  return {
    ...game,
    ratings: compactRatings(game.ratings ?? []),
    allRatings: compactRatings(game.allRatings ?? []),
    team: game.team ? {
      id: game.team.id,
      name: game.team.name,
      ownerId: game.team.ownerId,
      owner: game.team.owner,
      users: (game.team.users ?? []).map(user => ({ id: user.id })),
    } : game.team,
  };
}
