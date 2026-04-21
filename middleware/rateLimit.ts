import baseRateLimit from "express-rate-limit";

/**
 * Middleware to fetch the requesting user from the database.
 * Requires authUser to be called previously in the middleware chain.
 */
function rateLimit(limit = 30) {
  return baseRateLimit({
    limit,
    message: {
      message: "Too many requests, please try again later",
    },
  });
}

export default rateLimit;
