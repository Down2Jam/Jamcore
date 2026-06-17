import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = {
  notification: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  comment: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  trackRating: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  trackTimestampComment: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  gamePageTrack: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  score: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  gamePageLeaderboard: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  gamePageAchievement: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  rating: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  ghost: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  data: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  gamePageDownloadLink: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  gamePage: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  gameDownloadLink: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  game: { delete: vi.fn(async () => ({})) },
  teamApplication: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  teamInvite: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  team: { delete: vi.fn(async () => ({})) },
};

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    teamApplication: {
      create: vi.fn(async () => ({ id: 41 })),
      findFirst: vi.fn(async () => null),
    },
    teamInvite: {
      create: vi.fn(async () => ({ id: 51, user: { id: 6 } })),
      findFirst: vi.fn(async () => null),
    },
    notification: {
      create: vi.fn(async () => ({})),
    },
    team: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: typeof txMock) => unknown) => callback(txMock)),
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import { ForbiddenError } from "../src/lib/errors.js";
import {
  assertTargetTeamApplicationsOpen,
  assertTargetTeamHasNotInvitedUser,
  assertUserHasNotAppliedForTargetTeam,
  createTeamApplication,
  createTeamInvite,
  deleteTeamById,
} from "../src/features/teams/index.js";

describe("team collaboration service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.team.findUnique.mockReset();
  });

  it("creates applications and invites with notifications", async () => {
    await createTeamApplication({
      actor: { id: 2 },
      team: {
        id: 9,
        ownerId: 5,
      } as never,
      content: "hello",
    });

    expect(dbMock.teamApplication.create).toHaveBeenCalledWith({
      data: {
        userId: 2,
        teamId: 9,
        content: "hello",
      },
    });
    expect(dbMock.notification.create).toHaveBeenCalledWith({
      data: {
        teamApplicationId: 41,
        recipientId: 5,
        actorId: 2,
        type: "TEAM_APPLICATION",
      },
    });

    await createTeamInvite({
      actor: { id: 2 },
      team: {
        id: 9,
      } as never,
      targetUser: { id: 6 },
      content: "invite",
    });

    expect(dbMock.teamInvite.create).toHaveBeenCalledWith({
      data: {
        userId: 6,
        teamId: 9,
        content: "invite",
      },
      include: {
        user: true,
      },
    });
  });

  it("rejects ODA collaboration flows", async () => {
    const odaTeam = {
      id: 9,
      ownerId: 5,
      game: {
        category: "ODA",
      },
    } as never;

    await expect(
      createTeamApplication({
        actor: { id: 2 },
        team: odaTeam,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("checks application/open/invite constraints", async () => {
    expect(() =>
      assertTargetTeamApplicationsOpen({
        applicationsOpen: false,
      } as never),
    ).toThrow(ForbiddenError);

    dbMock.teamApplication.findFirst.mockResolvedValueOnce({ id: 1 } as never);
    await expect(
      assertUserHasNotAppliedForTargetTeam({
        userId: 2,
        teamId: 9,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    dbMock.teamInvite.findFirst.mockResolvedValueOnce({ id: 1 } as never);
    await expect(
      assertTargetTeamHasNotInvitedUser({
        targetUserId: 6,
        teamId: 9,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deletes a team through bulk transactional cleanup", async () => {
    dbMock.team.findUnique.mockResolvedValueOnce({
      id: 9,
      game: {
        id: 15,
        pages: [
          {
            id: 101,
            tracks: [{ id: 201 }],
            leaderboards: [{ id: 301 }],
            achievements: [{ id: 401 }],
          },
        ],
      },
      invites: [{ id: 11 }],
      applications: [{ id: 12 }],
    });

    await deleteTeamById(9);

    expect(dbMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.game.delete).toHaveBeenCalledWith({
      where: {
        id: 15,
      },
    });
    expect(txMock.team.delete).toHaveBeenCalledWith({
      where: {
        id: 9,
      },
    });
  });
});

