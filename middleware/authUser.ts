import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

/**
 * Middleware to check if the user is authenticated and that the authentication is valid
 */
function authUser(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  const refreshToken = req.cookies["refreshToken"] || req.headers["refresh"];
  const accessToken = authHeader && authHeader.split(" ")[1];

  if (!accessToken || !refreshToken) {
    res.status(401).send({ message: "Unauthorized: Missing tokens." });
    return;
  }

  if (!process.env.TOKEN_SECRET) {
    res.status(502).send("Token secret not set up");
    return;
  }

  try {
    // Verify access token
    const decoded = jwt.verify(accessToken, process.env.TOKEN_SECRET);

    // Extract username from access token
    const username = decoded.user || decoded.name; // Support both fields
    if (!username) {
      throw new Error("Access token missing 'user' or 'name' field");
    }

    res.locals.userSlug = username;
    next();
  } catch (error) {
    console.error("Access Token Error:", error.message);

    // If access token is invalid, try refreshing it
    try {
      const decodedRefresh = jwt.verify(refreshToken, process.env.TOKEN_SECRET);
      //console.log("Decoded Refresh Token:", decodedRefresh);

      // Extract username from refresh token
      const username = decodedRefresh.user || decodedRefresh.name; // Support both fields
      if (!username) {
        throw new Error("Refresh token missing 'user' or 'name' field");
      }

      // Generate a new access token
      const newAccessToken = jwt.sign(
        { user: username },
        process.env.TOKEN_SECRET,
        { expiresIn: "1h" }
      );

      res
        .cookie("refreshToken", refreshToken, {
          httpOnly: true,
          sameSite: "strict",
        })
        .header("Authorization", newAccessToken);

      res.locals.userSlug = username;
      next();
    } catch (refreshError) {
      console.error("Refresh Token Error:", refreshError.message);
      res.status(401).send({ message: "Unauthorized: Missing tokens." });
      return;
    }
  }
}

export default authUser;
