import { Router } from "express";
import db from "@helper/db";

const router = Router();
const documentationDocument = (db as any).documentationDocument;

router.get("/", async function (req, res) {
  const { section } = req.query;

  if (section !== "DOCS" && section !== "PRESS_KIT") {
    res.status(400).json({ message: "Invalid documentation section" });
    return;
  }

  const documents = await documentationDocument.findMany({
    where: {
      section,
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
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });

  res.json({ data: documents });
});

export default router;
