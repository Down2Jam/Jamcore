import { Router } from "express";
import db from "@helper/db";

const router = Router();
const documentationDocument = (db as any).documentationDocument;

router.get("/", async function (req, res) {
  const { slug, section } = req.query;

  if (!slug || typeof slug !== "string") {
    res.status(400).json({ message: "Missing document slug" });
    return;
  }

  if (section != null && section !== "DOCS" && section !== "PRESS_KIT") {
    res.status(400).json({ message: "Invalid documentation section" });
    return;
  }

  const document = await documentationDocument.findUnique({
    where: {
      slug,
    },
    include: {
      author: {
        select: {
          id: true,
          slug: true,
          name: true,
          profilePicture: true,
        },
      },
    },
  });

  if (!document || (section && document.section !== section)) {
    res.status(404).json({ message: "Document not found" });
    return;
  }

  res.json({ data: document });
});

export default router;
