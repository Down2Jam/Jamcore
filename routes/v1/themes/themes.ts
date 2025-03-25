import express from "express";
import {
  getCurrentActiveJam,
  checkJamParticipation,
} from "../../../services/jamService";
import authenticateUser from "../../../middleware/authUser";
import getUser from "@middleware/getUser";
import getJam from "@middleware/getJam";
import db from "@helper/db";

const router = express.Router();

router.get(
  "/suggestion",
  authenticateUser,
  checkJamParticipation,
  async function (req, res) {
    const username = res.locals.userSlug;

    // Find the user
    const user = await db.user.findUnique({
      where: { slug: username },
    });

    if (!user) {
      return res.status(401).send("Unauthorized: User not found.");
    }

    // Get current active jam
    const activeJam = await getCurrentActiveJam();
    if (!activeJam || !activeJam.futureJam) {
      return res.status(404).send("No active jam found.");
    }

    // Fetch user's suggestions for the current jam
    try {
      const suggestions = await db.themeSuggestion.findMany({
        where: {
          userId: user.id,
          jamId: activeJam.futureJam.id,
        },
      });

      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      res.status(500).send("Internal Server Error.");
    }
  }
);

router.delete(
  "/suggestion/:id",
  authenticateUser,
  checkJamParticipation,
  async function (req, res) {
    const suggestionId = parseInt(req.params.id);
    const username = res.locals.userSlug;

    // Find the user
    const user = await db.user.findUnique({
      where: { slug: username },
    });

    if (!user) {
      return res.status(401).send("Unauthorized: User not found.");
    }

    // Check if the suggestion belongs to the user
    const suggestion = await db.themeSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion || suggestion.userId !== user.id) {
      return res
        .status(403)
        .send("Unauthorized: You cannot delete this suggestion.");
    }

    // Delete the suggestion
    try {
      await db.themeSuggestion.delete({
        where: { id: suggestionId },
      });

      res.send("Suggestion deleted successfully.");
    } catch (error) {
      console.error("Error deleting suggestion:", error);
      res.status(500).send("Internal Server Error.");
    }
  }
);

router.put(
  "/suggestion/:id",
  authenticateUser,
  checkJamParticipation,
  async function (req, res) {
    const suggestionId = parseInt(req.params.id);
    const { suggestionText } = req.body;
    const username = res.locals.userSlug;

    if (!suggestionText) {
      return res.status(400).send("Suggestion text is required.");
    }

    // Find the user
    const user = await db.user.findUnique({
      where: { slug: username },
    });

    if (!user) {
      return res.status(401).send("Unauthorized: User not found.");
    }

    // Check if the suggestion belongs to the user
    const suggestion = await db.themeSuggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion || suggestion.userId !== user.id) {
      return res
        .status(403)
        .send("Unauthorized: You cannot update this suggestion.");
    }

    // Update the suggestion
    try {
      const updatedSuggestion = await db.themeSuggestion.update({
        where: { id: suggestionId },
        data: { suggestion: suggestionText },
      });

      res.json(updatedSuggestion);
    } catch (error) {
      console.error("Error updating suggestion:", error);
      res.status(500).send("Internal Server Error.");
    }
  }
);

router.post(
  "/suggestion",
  authenticateUser,
  checkJamParticipation,
  async function (req, res) {
    const { suggestionText } = req.body;

    if (!suggestionText) {
      return res.status(400).send("Suggestion text is required.");
    }

    // Extract username from authenticated user
    const username = res.locals.userSlug;
    console.log("Authenticated Username:", username);

    // Find the user in the database
    const user = await db.user.findUnique({
      where: { slug: username },
    });

    if (!user) {
      return res.status(401).send("Unauthorized: User not found.");
    }

    // Get the current active jam
    const activeJam = await getCurrentActiveJam();

    if (!activeJam || !activeJam.futureJam) {
      return res.status(404).send("No active jam found.");
    }

    if (activeJam && activeJam.futureJam && activeJam.phase != "Suggestion") {
      return res.status(404).send("It's not suggestion phase.");
    }

    // Check if themePerUser is set and enforce the limit
    const themeLimit = activeJam.futureJam.themePerUser || Infinity; // Default to no limit if themePerUser is not set

    try {
      // Count existing suggestions by the user for this jam
      const userSuggestionsCount = await db.themeSuggestion.count({
        where: {
          userId: user.id,
          jamId: activeJam.futureJam.id,
        },
      });

      if (userSuggestionsCount >= themeLimit) {
        return res
          .status(403)
          .send(`You have reached your limit of ${themeLimit} suggestions.`);
      }

      // Create the suggestion in the database
      const newSuggestion = await db.themeSuggestion.create({
        data: {
          suggestion: suggestionText,
          userId: user.id,
          jamId: activeJam.futureJam.id,
        },
      });

      res.status(201).json(newSuggestion);
    } catch (error) {
      console.error("Error creating suggestion:", error);
      res.status(500).send("Internal Server Error.");
    }
  }
);

/// SLAUGHTER VOTES

router.post(
  "/voteSlaughter",
  authenticateUser,
  getUser,
  getJam,
  checkJamParticipation,
  async (req, res) => {
    const { suggestionId, voteType } = req.body;

    if (!suggestionId || voteType == null) {
      res.status(400).send("Missing required fields.");
      return;
    }

    if (voteType != -1 && voteType != 0 && voteType != 1) {
      res.status(400).send("Invalid vote type.");
      return;
    }

    // Check phase
    if (res.locals.jamPhase !== "Elimination") {
      res.status(403).send("Elimination phase is not active");
      return;
    }

    try {
      // Check if the user already voted on this suggestion
      let existingVote = await db.themeVote.findFirst({
        where: {
          userId: res.locals.user.id,
          jamId: res.locals.jam.id,
          themeSuggestionId: suggestionId,
        },
      });

      if (existingVote) {
        await db.themeVote.update({
          where: { id: existingVote.id },
          data: { slaughterScore: voteType },
        });

        res.json({ message: "Edited vote successfully." });
      } else {
        await db.themeVote.create({
          data: {
            slaughterScore: voteType,
            userId: res.locals.user.id,
            jamId: res.locals.jam.id,
            themeSuggestionId: suggestionId,
          },
        });

        res.json({ message: "Vote recorded successfully." });
      }
    } catch (error) {
      console.error("Error voting on suggestion:", error);
      res.status(500).send("Internal Server Error.");
    }
  }
);

router.post(
  "/voteVoting",
  authenticateUser,
  getUser,
  getJam,
  checkJamParticipation,
  async (req, res) => {
    const { suggestionId, voteType } = req.body;

    if (!suggestionId || voteType == null) {
      res.status(400).send("Missing required fields.");
      return;
    }

    if (voteType != 1 && voteType != 0 && voteType != 3) {
      res.status(400).send("Invalid vote type.");
      return;
    }

    // Check phase
    if (res.locals.jamPhase !== "Voting") {
      res.status(403).send("Voting phase is not active");
      return;
    }

    if (
      res.locals.jam &&
      res.locals.jam &&
      new Date(res.locals.jam.startTime).getTime() - new Date().getTime() <=
        60 * 60 * 1000
    ) {
      return res.status(400).send("Voting is closed.");
    }

    try {
      // Check if the user already voted on this suggestion
      let existingVote = await db.themeVote2.findFirst({
        where: {
          userId: res.locals.user.id,
          jamId: res.locals.jam.id,
          themeSuggestionId: suggestionId,
          voteRound: 1,
        },
      });

      if (existingVote) {
        await db.themeVote2.update({
          where: { id: existingVote.id },
          data: { voteScore: voteType },
        });

        res.json({ message: "Edited vote successfully." });
      } else {
        await db.themeVote2.create({
          data: {
            voteScore: voteType,
            voteRound: 1,
            userId: res.locals.user.id,
            jamId: res.locals.jam.id,
            themeSuggestionId: suggestionId,
          },
        });

        res.json({ message: "Vote recorded successfully." });
      }
    } catch (error) {
      console.error("Error voting on suggestion:", error);
      res.status(500).send("Internal Server Error.");
    }
  }
);

router.get(
  "/votes",
  authenticateUser,
  checkJamParticipation,
  async (req, res) => {
    const username = res.locals.userSlug;

    const user = await db.user.findUnique({
      where: { slug: username },
    });

    if (!user) {
      return res.status(401).send("Unauthorized: User not found.");
    }

    const activeJam = await getCurrentActiveJam();
    if (!activeJam || !activeJam.futureJam) {
      return res.status(404).send("No active jam found.");
    }

    try {
      const votes = await db.themeVote.findMany({
        where: {
          userId: user.id,
          jamId: activeJam.futureJam.id,
        },
        select: {
          themeSuggestionId: true,
          votingScore: true,
        },
      });

      res.json(votes);
    } catch (error) {
      console.error("Error fetching user votes:", error);
      res.status(500).send("Internal Server Error");
    }
  }
);

router.post(
  "/vote",
  authenticateUser,
  checkJamParticipation,
  async (req, res) => {
    const username = res.locals.userSlug;
    const { suggestionId, votingScore } = req.body;

    if (!suggestionId || votingScore === undefined) {
      return res.status(400).send("Missing required fields.");
    }

    // Add vote value validation
    if (votingScore < -1 || votingScore > 1) {
      return res.status(400).send("Invalid voting score");
    }

    // Find the user
    const user = await db.user.findUnique({
      where: { slug: username },
    });

    if (!user) {
      return res.status(401).send("Unauthorized: User not found.");
    }

    // Get the current active jam
    const activeJam = await getCurrentActiveJam();
    if (!activeJam || !activeJam.futureJam) {
      return res.status(404).send("No active jam found.");
    }

    try {
      // Check if the user already voted on this suggestion
      let existingVote = await db.themeVote.findFirst({
        where: {
          userId: user.id,
          jamId: activeJam.futureJam.id,
          themeSuggestionId: suggestionId,
        },
      });

      if (existingVote) {
        // Calculate score difference
        const scoreDifference = votingScore - existingVote.votingScore;

        // Use transactions for critical operations
        await db.$transaction(async (tx) => {
          // Update vote
          await tx.themeVote.update({
            where: { id: existingVote.id },
            data: { votingScore },
          });

          // Update total score
          await tx.themeSuggestion.update({
            where: { id: suggestionId },
            data: {
              totalVotingScore: {
                increment: scoreDifference,
              },
            },
          });
        });
      } else {
        // Create a new vote record in ThemeVote table
        await db.themeVote.create({
          data: {
            votingScore,
            userId: user.id,
            jamId: activeJam.futureJam.id,
            themeSuggestionId: suggestionId,
          },
        });

        // Update totalVotingScore in ThemeSuggestion table
        await db.themeSuggestion.update({
          where: { id: suggestionId },
          data: {
            totalVotingScore: {
              increment: votingScore,
            },
          },
        });
      }

      res.json({ message: "Vote recorded successfully." });
    } catch (error) {
      console.error("Error updating voting scores:", error);
      res.status(500).send("Internal Server Error.");
    }
  }
);

export default router;
