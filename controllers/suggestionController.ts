import { Request, Response } from "express";
import { getCurrentActiveJam } from "../services/jamService";
import db from "@helper/db";

export const getSuggestions = async (req: Request, res: Response) => {
  try {
    // Get the current active jam
    const activeJam = await getCurrentActiveJam();
    if (!activeJam || !activeJam.futureJam) {
      return res.status(404).json({ message: "No active jam found" });
    }

    // Fetch all suggestions for the current jam
    const suggestions = await db.themeSuggestion.findMany({
      where: { jamId: activeJam.futureJam.id },
    });

    return res.json(suggestions);
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const postSuggestion = async (req: Request, res: Response) => {
  try {
    const { suggestionText, description, userId } = req.body;

    // Validate input
    if (!suggestionText || !userId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Get the current active jam
    const activeJam = await getCurrentActiveJam();
    if (!activeJam || !activeJam.futureJam) {
      return res.status(404).json({ message: "No active jam found" });
    }

    // Create a new suggestion in the database
    const newSuggestion = await db.themeSuggestion.create({
      data: {
        suggestion: suggestionText,
        description: description,
        userId,
        jamId: activeJam.futureJam.id,
      },
    });

    return res.status(201).json(newSuggestion);
  } catch (error) {
    console.error("Error posting suggestion:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
