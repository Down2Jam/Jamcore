import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    event: {
      findUnique: vi.fn(),
      create: vi.fn(async () => ({ id: 1 })),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../src/infra/db.js", () => ({
  default: dbMock,
}));

import { createEvent, listEvents } from "../src/features/events";

describe("events service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates events with unique slugs", async () => {
    dbMock.event.findUnique.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);

    await createEvent({
      title: "Launch Party",
      content: "hello",
      start: "2026-04-22T10:00[America/Toronto]",
      end: "2026-04-22T12:00[America/Toronto]",
      hostId: 2,
    });

    expect(dbMock.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: "launch-party-2",
          hostId: 2,
        }),
      }),
    );
  });

  it("lists events using the requested time filter", async () => {
    dbMock.event.findMany.mockResolvedValueOnce([{ id: 1 }]);

    const result = await listEvents({ filter: "past" });

    expect(dbMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endTime: expect.any(Object),
        }),
      }),
    );
    expect(result).toEqual([{ id: 1 }]);
  });
});

