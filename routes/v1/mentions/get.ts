import { Router } from "express";
import rateLimit from "@middleware/rateLimit";

const router = Router();

const SAFE_DOMAIN = /^[a-zA-Z0-9.-]+$/;

router.get("/", rateLimit(), async (req, res) => {
  const { type, slug, domain } = req.query;

  if (!type || (type !== "user" && type !== "game")) {
    res.status(400).json({ message: "Invalid mention type." });
    return;
  }

  if (!slug || typeof slug !== "string") {
    res.status(400).json({ message: "Invalid slug." });
    return;
  }

  if (!domain || typeof domain !== "string" || !SAFE_DOMAIN.test(domain)) {
    res.status(400).json({ message: "Invalid domain." });
    return;
  }

  const endpoint =
    type === "user"
      ? `/api/v1/user?targetUserSlug=${encodeURIComponent(slug)}`
      : `/api/v1/games/${encodeURIComponent(slug)}`;

  try {
    const response = await fetch(`https://${domain}${endpoint}`);
    if (!response.ok) {
      res.status(response.status).json({ message: "Mention lookup failed." });
      return;
    }
    const data = await response.json();
    res.json({ message: "Mention resolved", data });
  } catch (error) {
    console.error("Failed to resolve mention", error);
    res.status(502).json({ message: "Failed to resolve mention." });
  }
});

export default router;
