import { describe, expect, it } from "vitest";

import {
  canManageScoreInTeamContext,
  canManageTargetTeam,
  canModerateUserTarget,
  canUseStreamerTools,
  ownsTeam,
} from "../src/domain/userPolicies.js";

describe("userPolicies", () => {
  it("allows moderators or self for user-target actions", () => {
    expect(
      canModerateUserTarget({ id: 1, mod: true }, { id: 2 }),
    ).toBe(true);
    expect(
      canModerateUserTarget({ id: 1, mod: false }, { id: 1 }),
    ).toBe(true);
    expect(
      canModerateUserTarget({ id: 1, mod: false }, { id: 2 }),
    ).toBe(false);
  });

  it("recognizes team ownership and management", () => {
    expect(ownsTeam({ id: 7 }, { ownerId: 7 })).toBe(true);
    expect(canManageTargetTeam({ id: 7, mod: false }, { ownerId: 7 })).toBe(
      true,
    );
    expect(canManageTargetTeam({ id: 7, mod: false }, { ownerId: 8 })).toBe(
      false,
    );
  });

  it("allows moderators, team members, or score owners to manage scores", () => {
    expect(
      canManageScoreInTeamContext({
        user: { id: 1, mod: false },
        team: { users: [{ id: 1 }] },
        score: { userId: 2 },
      }),
    ).toBe(true);
    expect(
      canManageScoreInTeamContext({
        user: { id: 1, mod: false },
        team: { users: [{ id: 3 }] },
        score: { userId: 1 },
      }),
    ).toBe(true);
    expect(
      canManageScoreInTeamContext({
        user: { id: 1, mod: false },
        team: { users: [{ id: 3 }] },
        score: { userId: 2 },
      }),
    ).toBe(false);
  });

  it("allows moderators or streamers to use streamer tools", () => {
    expect(canUseStreamerTools({ mod: true, twitch: null })).toBe(true);
    expect(canUseStreamerTools({ mod: false, twitch: "channel" })).toBe(true);
    expect(canUseStreamerTools({ mod: false, twitch: null })).toBe(false);
  });
});
