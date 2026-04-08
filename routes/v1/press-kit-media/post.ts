import { Router } from "express";
import db from "@helper/db";
import { getAdminUserFromRequest } from "@helper/getAdminUserFromRequest";

const router = Router();
const pressKitMedia = (db as any).pressKitMedia;

router.post("/", async function (req, res) {
  const { image, altText, username } = req.body;

  if (
    typeof image !== "string" ||
    !image.trim() ||
    typeof username !== "string" ||
    (altText != null && typeof altText !== "string")
  ) {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  const user = await getAdminUserFromRequest(req, res, username);
  if (!user) return;

  const media = await pressKitMedia.create({
    data: {
      image: image.trim(),
      altText: typeof altText === "string" && altText.trim() ? altText.trim() : null,
      authorId: user.id,
    },
  });

  res.json({ data: media });
});

export default router;
