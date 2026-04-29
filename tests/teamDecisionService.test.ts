import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    teamApplication: {
      findUnique: vi.fn(),
      delete: vi.fn(async () => ({})),
    },
    teamInvite: {
      findUnique: vi.fn(),
      delete: vi.fn(async () => ({})),
    },
    team: {
      update: vi.fn(async () => ({})),
    },
    notification: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}));

vi.mock("../infra/db.js", () => ({
  default: dbMock,
}));

import { ForbiddenError, NotFoundError } from "../lib/errors.js";
import {
  resolveTeamApplication,
  resolveTeamInvite,
} from "../features/teams/index.js";

describe("team decision service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts and deletes a team application", async () => {
    dbMock.teamApplication.findUnique.mockResolvedValue({
      id: 3,
      userId: 6,
      teamId: 9,
      team: { game: null },
    });

    await resolveTeamApplication({ applicationId: 3, accept: true });

    expect(dbMock.team.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { users: { connect: { id: 6 } } },
    });
    expect(dbMock.notification.deleteMany).toHaveBeenCalledWith({
      where: { teamApplicationId: 3 },
    });
    expect(dbMock.teamApplication.delete).toHaveBeenCalledWith({
      where: { id: 3 },
    });
  });

  it("rejects invalid or ODA applications", async () => {
    dbMock.teamApplication.findUnique.mockResolvedValueOnce(null);
    await expect(
      resolveTeamApplication({ applicationId: 3, accept: false }),
    ).rejects.toBeInstanceOf(NotFoundError);

    dbMock.teamApplication.findUnique.mockResolvedValueOnce({
      id: 3,
      userId: 6,
      teamId: 9,
      team: { game: { category: "ODA" } },
    });
    await expect(
      resolveTeamApplication({ applicationId: 3, accept: true }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("accepts invites for the current actor", async () => {
    dbMock.teamInvite.findUnique.mockResolvedValue({
      id: 4,
      userId: 6,
      teamId: 9,
      team: { game: null },
    });

    await resolveTeamInvite({ inviteId: 4, accept: true, actorUserId: 2 });

    expect(dbMock.team.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { users: { connect: { id: 2 } } },
    });
    expect(dbMock.notification.deleteMany).toHaveBeenCalledWith({
      where: { teamInviteId: 4 },
    });
    expect(dbMock.teamInvite.delete).toHaveBeenCalledWith({
      where: { id: 4 },
    });
  });
});

