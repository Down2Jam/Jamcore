import { beforeEach, describe, expect, it, vi } from "vitest";
const { loadUser, grants } = vi.hoisted(() => ({ loadUser: vi.fn(), grants: vi.fn() }));
vi.mock("../src/features/users/index.js", () => ({ loadRequestUserBySlug: loadUser, loadOptionalRequestUserBySlug: loadUser }));
vi.mock("../src/infra/platformStore.js", () => ({ listRoleGrantsFromDb: grants }));
import getUser from "../src/loaders/getUser.js";
import getUserOptional from "../src/loaders/getUserOptional.js";
import { loadAuthorizationGrants } from "../src/middleware/authorizationContext.js";
import scorePermission from "../src/guards/assertUserModOrUserScoreOwner.js";

beforeEach(() => { vi.resetAllMocks(); loadUser.mockResolvedValue({ id: 7, slug: "owner", admin: true, mod: true }); });
describe("game tokens act only as the player", () => {
  it.each([getUser, getUserOptional])("removes elevated flags in both user loaders", async loader => {
    const response = { locals: { authMethod: "gameToken", userSlug: "owner" } };
    const next = vi.fn();
    await loader({} as never, response as never, next);
    expect(response.locals).toMatchObject({ user: { id: 7, admin: false, mod: false } });
    expect(next).toHaveBeenCalledWith();
  });
  it("does not inherit platform roles or previously cached grants", async () => {
    const response = { locals: { authMethod: "gameToken", user: { id: 7 }, authorizationGrants: [{ role: "admin" }] } };
    expect(await loadAuthorizationGrants(response as never)).toEqual([]);
    expect(grants).not.toHaveBeenCalled();
  });
  it.each([true, false])("deletes only the player's scores (owner=%s)", owner => {
    const next = vi.fn();
    scorePermission({} as never, { locals: { authMethod: "gameToken", user: { id: 7, admin: true, mod: true }, team: { users: [{ id: 7 }] }, score: { userId: owner ? 7 : 8 } } } as never, next);
    if (owner) expect(next).toHaveBeenCalledWith(undefined);
    else expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
