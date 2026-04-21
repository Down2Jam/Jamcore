import { Router } from "express";
import db from "@helper/db";
import { getAdminUserFromRequest } from "@helper/getAdminUserFromRequest";

const router = Router();
const documentationDocument = (db as any).documentationDocument;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

router.post("/", async function (req, res) {
  const { title, content, username, section, icon } = req.body;

  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof content !== "string" ||
    !content.trim() ||
    typeof username !== "string" ||
    (icon != null && typeof icon !== "string") ||
    (section !== "DOCS" && section !== "PRESS_KIT")
  ) {
    res.status(400).json({ message: "Invalid request body" });
    return;
  }

  const user = await getAdminUserFromRequest(req, res, username);
  if (!user) return;

  const lastDocument = await documentationDocument.findFirst({
    where: {
      section,
    },
    orderBy: [{ order: "desc" }, { id: "desc" }],
  });

  const slugBase = slugify(title.trim());
  let slug = slugBase;
  let count = 1;

  while (true) {
    const existingDocument = await documentationDocument.findUnique({
      where: { slug },
    });

    if (!existingDocument) break;

    count += 1;
    slug = `${slugBase}-${count}`;
  }

  const document = await documentationDocument.create({
    data: {
      title: title.trim(),
      slug,
      content,
      icon: typeof icon === "string" && icon.trim() ? icon.trim() : "book",
      order: (lastDocument?.order ?? -1) + 1,
      section,
      authorId: user.id,
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

  res.json({ data: document });
});

export default router;
