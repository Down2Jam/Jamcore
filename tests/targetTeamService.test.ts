import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    team: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import { BadRequestError, NotFoundError } from "../src/lib/errors.js";
import {
  loadTargetTeamContext,
  parseTargetTeamId,
} from "../src/features/teams/index.js";

describe("target team service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a positive team id", () => {
    expect(parseTargetTeamId("12")).toBe(12);
  });

  it("rejects missing or invalid team ids", () => {
    expect(() => parseTargetTeamId(undefined)).toThrow(BadRequestError);
    expect(() => parseTargetTeamId("abc")).toThrow(BadRequestError);
  });

  it("loads a target team context and errors when missing", async () => {
    dbMock.team.findUnique.mockResolvedValueOnce({ id: 12, users: [] });
    await expect(loadTargetTeamContext("12")).resolves.toEqual({
      id: 12,
      users: [],
    });

    dbMock.team.findUnique.mockResolvedValueOnce(null);
    await expect(loadTargetTeamContext("99")).rejects.toBeInstanceOf(NotFoundError);
  });
});

