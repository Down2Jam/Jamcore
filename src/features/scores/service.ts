import { z } from "zod";

import db from "../../infra/db.js";

export const createScoreSchema = z.object({
  score: z.number(),
  evidence: z.string().trim().min(1).optional(),
  evidenceUrl: z.string().trim().min(1).optional(),
});

type ScoreActor = {
  id: number;
};

type ScoreLeaderboard = {
  id: number;
  type: string;
  decimalPlaces: number;
};

export async function createScore({
  input,
  actor,
  leaderboard,
}: {
  input: z.infer<typeof createScoreSchema>;
  actor: ScoreActor;
  leaderboard: ScoreLeaderboard;
}) {
  const normalizedEvidence = input.evidence ?? input.evidenceUrl ?? "";
  const multiplier =
    leaderboard.type === "SCORE" || leaderboard.type === "GOLF"
      ? 10 ** leaderboard.decimalPlaces
      : 1;

  return db.score.create({
    data: {
      evidence: normalizedEvidence,
      data: input.score * multiplier,
      userId: actor.id,
      leaderboardId: leaderboard.id,
    },
  });
}

export async function deleteScore(scoreId: number) {
  await db.score.delete({
    where: {
      id: scoreId,
    },
  });
}

