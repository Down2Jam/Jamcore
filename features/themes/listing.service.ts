import db from "../../infra/db.js";

export async function listThemesForJam({
  jamId,
  userId,
  isVoting,
}: {
  jamId: number;
  userId: number;
  isVoting?: boolean;
}) {
  if (isVoting) {
    const themesWithScores = await db.themeVote.groupBy({
      by: ["themeSuggestionId"],
      _sum: {
        slaughterScore: true,
      },
      orderBy: [
        {
          _sum: {
            slaughterScore: "desc",
          },
        },
        {
          themeSuggestionId: "asc",
        },
      ],
      where: {
        jamId,
      },
      take: 15,
    });

    const themeIds = themesWithScores.map((theme) => theme.themeSuggestionId);
    const suggestions = await db.themeSuggestion.findMany({
      where: {
        id: { in: themeIds },
        jamId,
      },
      include: {
        votes2: {
          where: {
            userId,
          },
        },
      },
    });

    return themesWithScores.map((score) => ({
      ...suggestions.find((theme) => theme.id === score.themeSuggestionId),
      slaughterScoreSum: score._sum.slaughterScore,
    }));
  }

  return db.themeSuggestion.findMany({
    include: {
      votes: {
        where: {
          userId,
        },
      },
    },
    where: {
      jamId,
    },
  });
}

export async function getTopThemeForJam(jamId: number) {
  const themes = await db.themeSuggestion.findMany({
    where: {
      jamId,
      votes2: {
        some: {},
      },
    },
    include: {
      votes2: true,
    },
  });

  const rankedThemes = themes
    .map((theme) => ({
      ...theme,
      stars: theme.votes2.filter((vote) => vote.voteScore === 3).length,
      likes: theme.votes2.filter((vote) => vote.voteScore === 1).length,
      voteAmount: theme.votes2.length,
      voteScore: theme.votes2.reduce((sum, vote) => sum + vote.voteScore, 0),
    }))
    .sort((a, b) =>
      a.voteScore !== b.voteScore
        ? b.voteScore - a.voteScore
        : a.stars !== b.stars
          ? b.stars - a.stars
          : a.likes !== b.likes
            ? b.likes - a.likes
            : a.voteAmount !== b.voteAmount
              ? b.voteAmount - a.voteAmount
              : a.id - b.id,
    );

  return rankedThemes[0] ?? null;
}
