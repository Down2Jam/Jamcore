import { Router } from "express";
import rateLimit from "@middleware/rateLimit";
import { clearSession } from "../../../auth/session.js";

const router = Router();

/**
 * Route to delete a session from the database.
 * Used for logging out.
 */
router.delete(
  "/",
  rateLimit(),
  async (_req, res) => {
    clearSession(res);
    res.status(200);
    res.send({ message: "Logged out successfully" });
  }
);

export default router;
