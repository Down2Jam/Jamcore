import { beforeEach, describe, expect, it, vi } from "vitest";

const { brightenMock, darkenMock, hexMock, validMock, readdirMock, readFileMock } =
  vi.hoisted(() => {
    const hexMock = vi.fn(() => "#abcdef");
    const darkenMock = vi.fn(() => ({ brighten: brightenMock, darken: darkenMock, hex: hexMock }));
    const brightenMock = vi.fn(() => ({ brighten: brightenMock, darken: darkenMock, hex: hexMock }));
    return {
      brightenMock,
      darkenMock,
      hexMock,
      validMock: vi.fn(() => true),
      readdirMock: vi.fn(),
      readFileMock: vi.fn(),
    };
  });

vi.mock("fs/promises", () => ({
  readdir: readdirMock,
  readFile: readFileMock,
}));

vi.mock("chroma-js", () => ({
  default: Object.assign(
    vi.fn(() => ({
      brighten: brightenMock,
      darken: darkenMock,
      hex: hexMock,
    })),
    {
      valid: validMock,
    },
  ),
}));

import { listSiteThemes } from "../src/features/site-themes";

describe("site themes service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and resolves themed color chains", async () => {
    readdirMock.mockResolvedValue(["base.json", "child.json"]);
    readFileMock
      .mockResolvedValueOnce(
        JSON.stringify({
          name: "base",
          type: "light",
          colors: {
            bg: "#ffffff",
          },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          name: "child",
          type: "light",
          extends: "base",
          colors: {
            fg: "@bg > darken",
          },
        }),
      );

    await expect(listSiteThemes()).resolves.toEqual([
      {
        name: "base",
        type: "light",
        colors: {
          bg: "#ffffff",
        },
      },
      {
        name: "child",
        type: "light",
        extends: "base",
        colors: {
          bg: "#ffffff",
          fg: "#abcdef",
        },
      },
    ]);
  });
});
