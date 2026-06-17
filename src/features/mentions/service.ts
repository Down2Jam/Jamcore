import { z } from "zod";

import { ApiError, ConfigurationError } from "../../lib/errors.js";

const SAFE_DOMAIN = /^[a-zA-Z0-9.-]+$/;

export const resolveMentionQuerySchema = z.object({
  type: z.enum(["user", "game"]),
  slug: z.string().trim().min(1),
  domain: z.string().trim().regex(SAFE_DOMAIN, "Invalid domain."),
});

function buildMentionEndpoint(input: z.infer<typeof resolveMentionQuerySchema>) {
  return input.type === "user"
    ? `/api/v1/users/${encodeURIComponent(input.slug)}`
    : `/api/v1/games/${encodeURIComponent(input.slug)}`;
}

export async function resolveMention(
  input: z.infer<typeof resolveMentionQuerySchema>,
) {
  const endpoint = buildMentionEndpoint(input);

  try {
    const response = await fetch(`https://${input.domain}${endpoint}`);
    if (!response.ok) {
      throw new ApiError(response.status, "Mention lookup failed.");
    }

    return response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ConfigurationError("Failed to resolve mention.");
  }
}
