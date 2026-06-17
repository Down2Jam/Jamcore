import db from "../../infra/db.js";

export async function saveSlaughterVote({
  suggestionId,
  voteType,
  userId,
  jamId,
}: {
  suggestionId: number;
  voteType: -1 | 0 | 1;
  userId: number;
  jamId: number;
}) {
  const existingVote = await db.themeVote.findFirst({
    where: {
      userId,
      jamId,
      themeSuggestionId: suggestionId,
    },
  });

  if (existingVote) {
    await db.themeVote.update({
      where: { id: existingVote.id },
      data: { slaughterScore: voteType },
    });
    return { edited: true };
  }

  await db.themeVote.create({
    data: {
      slaughterScore: voteType,
      userId,
      jamId,
      themeSuggestionId: suggestionId,
    },
  });

  return { edited: false };
}

export async function saveVotingRoundVote({
  suggestionId,
  voteType,
  userId,
  jamId,
  voteRound = 1,
}: {
  suggestionId: number;
  voteType: 0 | 1 | 3;
  userId: number;
  jamId: number;
  voteRound?: number;
}) {
  const existingVote = await db.themeVote2.findFirst({
    where: {
      userId,
      jamId,
      themeSuggestionId: suggestionId,
      voteRound,
    },
  });

  if (existingVote) {
    await db.themeVote2.update({
      where: { id: existingVote.id },
      data: { voteScore: voteType },
    });
    return { edited: true };
  }

  await db.themeVote2.create({
    data: {
      voteScore: voteType,
      voteRound,
      userId,
      jamId,
      themeSuggestionId: suggestionId,
    },
  });

  return { edited: false };
}

export async function listSlaughterVotesForUser({
  userId,
  jamId,
}: {
  userId: number;
  jamId: number;
}) {
  return db.themeVote.findMany({
    where: {
      userId,
      jamId,
    },
    select: {
      themeSuggestionId: true,
      slaughterScore: true,
    },
  });
}
