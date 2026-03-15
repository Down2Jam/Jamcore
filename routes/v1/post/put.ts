import { Router } from "express";
import db from "@helper/db";
import { notifyNewMentions } from "@helper/mentionNotifications";
import jwt from "jsonwebtoken";
import { SESSION_DURATION_MS } from "@helper/authCookies";

const router = Router();

router.put("/", async function (req, res) {
  const { postId, username, title, content, tags, sticky } = req.body;
  const postIdNumber = parseInt(String(postId), 10);

  if (!postId || Number.isNaN(postIdNumber) || !username) {
    res.status(400).send("Invalid post ID.");
    return;
  }

  if (title == null && content == null && tags == null && sticky == null) {
    res.status(400).send("No update fields provided.");
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
          maxAge: SESSION_DURATION_MS,
        })
        .header("Authorization", accessToken);
    } catch (error) {
      res.status(400);
      res.send("Invalid Token.");
      return;
    }
  }

  const post = await db.post.findUnique({
    where: { id: postIdNumber },
  });

  if (!post) {
    res.status(404);
    res.send();
    return;
  }

  if (post.deletedAt || post.removedAt) {
    res.status(400).send("Cannot edit a deleted or removed post.");
    return;
  }

  const user = await db.user.findUnique({
    where: { slug: username },
  });

  if (!user) {
    res.status(401);
    res.send();
    return;
  }

  const isAuthor = post.authorId === user.id;
  const isModerator = user.mod === true;

  if (!isAuthor && !isModerator) {
    res.status(403);
    res.send();
    return;
  }

  if (Array.isArray(tags) && tags.length > 0) {
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

  const data: {
    title?: string;
    content?: string;
    sticky?: boolean;
    editedAt?: Date;
    tags?: { set: Array<{ id: number }> };
  } = {};
  let shouldMarkEdited = false;

  if (typeof title === "string") {
    data.title = title;
    if (title !== post.title) shouldMarkEdited = true;
  }

  if (typeof content === "string") {
    data.content = content;
    if (content !== post.content) shouldMarkEdited = true;
  }

  if (typeof sticky === "boolean") {
    data.sticky = sticky;
  }

  if (Array.isArray(tags)) {
    data.tags = { set: tags.map((tagId: number) => ({ id: tagId })) };
    shouldMarkEdited = true;
  }

  if (shouldMarkEdited) {
    data.editedAt = new Date();
  }

  const updatedPost = await db.post.update({
    where: { id: postIdNumber },
    data,
    include: { tags: true },
  });

  await notifyNewMentions({
    type: "post",
    actorId: user.id,
    actorName: user.name,
    actorSlug: user.slug,
    beforeContent: post.content,
    afterContent: typeof content === "string" ? content : post.content,
    postId: updatedPost.id,
    postSlug: updatedPost.slug,
    postTitle: updatedPost.title,
  });

  res.json(updatedPost);
});

export default router;
