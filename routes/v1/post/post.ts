import { Router } from "express";
import db from "@helper/db";
import jwt from "jsonwebtoken";

const router = Router();

// TODO: clean

/**
 * Route to get a user from the database.
 */
router.post("/", async function (req, res) {
  const { title, content, username, tags, sticky = false } = req.body;

  if (!title || !content || !username) {
    res.status(400);
    res.send();
    return;
  }

  const authHeader = req.headers["authorization"];
  const refreshToken = req.cookies["refreshToken"];
  const accessToken = authHeader && authHeader.split(" ")[1];

  if (accessToken == null) {
    res.status(401);
    res.send();
    return;
  }
  if (refreshToken == null) {
    res.status(401);
    res.send();
    return;
  }
  if (!process.env.TOKEN_SECRET) {
    res.status(500);
    res.send();
    return;
  }

  try {
    jwt.verify(accessToken, process.env.TOKEN_SECRET);
  } catch (error) {
    if (!refreshToken) {
      res.status(401);
      res.send("Access Denied. No refresh token provided.");
      return;
    }

    try {
      jwt.verify(refreshToken, process.env.TOKEN_SECRET);
      const accessToken = jwt.sign(
        { user: username },
        process.env.TOKEN_SECRET,
        {
          expiresIn: "1h",
        }
      );

      res
        .cookie("refreshToken", refreshToken, {
          httpOnly: true,
          sameSite: "strict",
        })
        .header("Authorization", accessToken);
    } catch (error) {
      res.status(400);
      res.send("Invalid Token.");
      return;
    }
  }

  const user = await db.user.findUnique({
    where: {
      slug: username,
    },
  });

  if (!user) {
    res.status(401);
    res.send();
    return;
  }

  if (tags && tags.length > 0) {
    const modTags = await db.tag.findMany({
      where: {
        id: { in: tags },
        modOnly: true,
      },
    });

    if (modTags.length > 0 && !user.mod) {
      res.status(403).send("Insufficient permissions to use moderator tags.");
      return;
    }
  }

  let slugBase = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  let slug = slugBase;
  let count = 1;

  while (true) {
    const existingPost = await db.post.findUnique({
      where: { slug },
    });

    if (!existingPost) break;

    count++;
    slug = `${slugBase}-${count}`;
  }

  const newpost = await db.post.create({
    data: {
      title,
      slug,
      sticky,
      content,
      authorId: user.id,
    },
  });

  await db.like.create({
    data: {
      userId: user.id,
      postId: newpost.id,
    },
  });

  if (tags && tags.length > 0) {
    await db.post.update({
      where: { id: newpost.id },
      data: {
        tags: {
          connect: tags.map((tagId: number) => ({ id: tagId })),
        },
      },
    });
  }

  res.send("Post created");
});

export default router;
