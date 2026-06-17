import express from "express";

import authenticateUser from "@middleware/authUser";
import { asyncHandler } from "@middleware/asyncHandler";
import getJam from "@loaders/getJam";
import getUser from "@loaders/getUser";
import {
  assertEliminationPhase,
  assertSuggestionPhase,
  assertVotingPhase,
  assertVotingStillOpen,
  createThemeSuggestion,
  createThemeSuggestionSchema,
  deleteThemeSuggestionForUser,
  deleteThemeSuggestionParamsSchema,
  listSlaughterVotesForUser,
  listUserThemeSuggestions,
  saveSlaughterVote,
  saveVotingRoundVote,
  slaughterVoteSchema,
  votingVoteSchema,
} from "./index.js";
import { checkJamParticipation } from "@features/jams";
import { requireLoadedJam, requireRequestUser } from "@lib/locals";
import { parseBody, parseParams } from "../../lib/request.js";

export function createThemesRouter() {
  const router = express.Router();

  router.get(
    "/suggestion",
    authenticateUser,
    getUser,
    getJam,
    checkJamParticipation,
    asyncHandler(async (_req, res) => {
      const user = requireRequestUser(res);
      const jam = requireLoadedJam(res);

      const suggestions = await listUserThemeSuggestions({
        userId: user.id,
        jamId: jam.id,
      });

      res.json({ message: "Suggestions fetched", data: suggestions });
    }),
  );

  router.delete(
    "/suggestion/:id",
    authenticateUser,
    getUser,
    getJam,
    checkJamParticipation,
    asyncHandler(async (req, res) => {
      const { id } = parseParams(req, deleteThemeSuggestionParamsSchema);
      const user = requireRequestUser(res);

      await deleteThemeSuggestionForUser({
        suggestionId: id,
        userId: user.id,
      });

      res.send("Suggestion deleted successfully.");
    }),
  );

  router.post(
    "/suggestion",
    authenticateUser,
    getUser,
    getJam,
    checkJamParticipation,
    asyncHandler(async (req, res) => {
      const { suggestionText, description } = parseBody(req, createThemeSuggestionSchema);
      const user = requireRequestUser(res);
      const jam = requireLoadedJam<{
        themePerUser?: number | null;
      }>(res);

      assertSuggestionPhase(res.locals.jamPhase);

      const suggestion = await createThemeSuggestion({
        suggestionText,
        description,
        userId: user.id,
        jamId: jam.id,
        themeLimit: jam.themePerUser,
      });

      res.status(201).json(suggestion);
    }),
  );

  router.post(
    "/voteSlaughter",
    authenticateUser,
    getUser,
    getJam,
    checkJamParticipation,
    asyncHandler(async (req, res) => {
      const { suggestionId, voteType } = parseBody(req, slaughterVoteSchema);
      const user = requireRequestUser(res);
      const jam = requireLoadedJam(res);

      assertEliminationPhase(res.locals.jamPhase);

      const result = await saveSlaughterVote({
        suggestionId,
        voteType,
        userId: user.id,
        jamId: jam.id,
      });

      res.json({
        message: result.edited
          ? "Edited vote successfully."
          : "Vote recorded successfully.",
      });
    }),
  );

  router.post(
    "/voteVoting",
    authenticateUser,
    getUser,
    getJam,
    checkJamParticipation,
    asyncHandler(async (req, res) => {
      const { suggestionId, voteType } = parseBody(req, votingVoteSchema);
      const user = requireRequestUser(res);
      const jam = requireLoadedJam(res);

      assertVotingPhase(res.locals.jamPhase);
      assertVotingStillOpen(jam.startTime);

      const result = await saveVotingRoundVote({
        suggestionId,
        voteType,
        userId: user.id,
        jamId: jam.id,
        voteRound: 1,
      });

      res.json({
        message: result.edited
          ? "Edited vote successfully."
          : "Vote recorded successfully.",
      });
    }),
  );

  router.get(
    "/votes",
    authenticateUser,
    getUser,
    getJam,
    checkJamParticipation,
    asyncHandler(async (_req, res) => {
      const user = requireRequestUser(res);
      const jam = requireLoadedJam(res);

      const votes = await listSlaughterVotesForUser({
        userId: user.id,
        jamId: jam.id,
      });

      res.json(votes);
    }),
  );

  router.post(
    "/vote",
    authenticateUser,
    getUser,
    getJam,
    checkJamParticipation,
    asyncHandler(async (req, res) => {
      const { suggestionId, voteType } = parseBody(req, slaughterVoteSchema);
      const user = requireRequestUser(res);
      const jam = requireLoadedJam(res);

      const result = await saveSlaughterVote({
        suggestionId,
        voteType,
        userId: user.id,
        jamId: jam.id,
      });

      res.json({
        message: result.edited
          ? "Edited vote successfully."
          : "Vote recorded successfully.",
      });
    }),
  );

  return router;
}
