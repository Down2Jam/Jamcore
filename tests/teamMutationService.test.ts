import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    team: {
      create: vi.fn(),
      update: vi.fn(),
    },
    teamInvite: {
      delete: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import {
  createTeam,
  leaveTeamById,
  updateTeamById,
} from "../src/features/teams/index.js";

describe("team mutation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.team.update.mockReset();
    dbMock.team.update
      .mockResolvedValueOnce({
        rolesWanted: [{ slug: "art" }, { slug: "code" }],
        users: [{ id: 1 }, { id: 2 }],
        invites: [{ id: 10 }, { id: 11 }],
      })
      .mockResolvedValueOnce({});
  });

  it("updates the team core fields and synchronizes members, roles, and invites", async () => {
    await updateTeamById({
      teamId: 5,
      input: {
        applicationsOpen: true,
        rolesWanted: ["code", "music", "music"],
        description: "New desc",
        users: [{ id: 1 }],
        invitations: [{ id: 11 }],
        name: "Team Name",
      },
    });

    expect(dbMock.team.update).toHaveBeenNthCalledWith(1, {
      where: {
        id: 5,
      },
      data: {
        applicationsOpen: true,
        description: "New desc",
        name: "Team Name",
      },
      select: {
        rolesWanted: { select: { slug: true } },
        users: true,
        invites: true,
      },
    });

    expect(dbMock.team.update).toHaveBeenNthCalledWith(2, {
      where: { id: 5 },
      data: {
        rolesWanted: {
          disconnect: [{ slug: "art" }],
          connect: [{ slug: "code" }, { slug: "music" }],
        },
        users: {
          disconnect: [{ id: 2 }],
        },
      },
    });

    expect(dbMock.teamInvite.delete).toHaveBeenCalledTimes(1);
    expect(dbMock.teamInvite.delete).toHaveBeenCalledWith({
      where: {
        id: 10,
      },
    });
  });

  it("creates a team owned by the requesting user in the active jam", async () => {
    dbMock.team.create.mockResolvedValueOnce({});

    await createTeam({
      ownerId: 7,
      jamId: 3,
    });

    expect(dbMock.team.create).toHaveBeenCalledWith({
      data: {
        ownerId: 7,
        jamId: 3,
        users: {
          connect: { id: 7 },
        },
      },
    });
  });

  it("disconnects the current user when leaving a team", async () => {
    dbMock.team.update.mockResolvedValueOnce({});

    await leaveTeamById({
      teamId: 5,
      userId: 2,
    });

    expect(dbMock.team.update).toHaveBeenCalledWith({
      where: {
        id: 5,
      },
      data: {
        users: {
          disconnect: { id: 2 },
        },
      },
    });
  });
});

