import db from "../../infra/db.js";
import { z } from "zod";
import { getCurrentActiveJam } from "../jams/index.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { createCurrentJamThemeSuggestionSchema } from "./schemas.js";

export async function listUserThemeSuggestions({
  userId,
  jamId,
}: {
  userId: number;
  jamId: number;
}) {
  return db.themeSuggestion.findMany({
    where: {
      userId,
      jamId,
    },
  });
}

export async function deleteThemeSuggestionForUser({
  suggestionId,
  userId,
}: {
  suggestionId: number;
  userId: number;
}) {
  const suggestion = await db.themeSuggestion.findUnique({
    where: { id: suggestionId },
  });

  if (!suggestion || suggestion.userId !== userId) {
    throw new ForbiddenError("Unauthorized: You cannot delete this suggestion.");
  }

  await db.themeSuggestion.delete({
    where: { id: suggestionId },
  });
}

export async function createThemeSuggestion({
  suggestionText,
  description,
  userId,
  jamId,
  themeLimit,
}: {
  suggestionText: string;
  description?: string;
  userId: number;
  jamId: number;
  themeLimit?: number | null;
}) {
  const userSuggestionsCount = await db.themeSuggestion.count({
    where: {
      userId,
      jamId,
    },
  });

  const normalizedThemeLimit =
    typeof themeLimit === "number" && Number.isFinite(themeLimit)
      ? themeLimit
      : Infinity;

  if (userSuggestionsCount >= normalizedThemeLimit) {
    throw new ForbiddenError(
      `You have reached your limit of ${normalizedThemeLimit} suggestions.`,
    );
  }

  return db.themeSuggestion.create({
    data: {
      suggestion: suggestionText,
      userId,
      jamId,
      description,
    },
  });
}

export async function listCurrentJamThemeSuggestions() {
  const activeJam = await getCurrentActiveJam();
  if (!activeJam?.jam) {
    throw new NotFoundError("No active jam found");
  }

  return db.themeSuggestion.findMany({
    where: {
      jamId: activeJam.jam.id,
    },
  });
}

export async function createCurrentJamThemeSuggestion({
  suggestionText,
  description,
  userId,
}: z.infer<typeof createCurrentJamThemeSuggestionSchema>) {
  const activeJam = await getCurrentActiveJam();
  if (!activeJam?.jam) {
    throw new NotFoundError("No active jam found");
  }

  return db.themeSuggestion.create({
    data: {
      suggestion: suggestionText,
      description,
      userId,
      jamId: activeJam.jam.id,
    },
  });
}
