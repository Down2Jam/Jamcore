import type {
  OptionalRequestUserContext,
  RequestUserContext,
} from "./user.js";
import type { ServiceKeyIdentity } from "../auth/service.js";
import type { TargetTeamContext } from "../features/teams/index.js";
import type { loadTargetUserContext } from "../features/users/index.js";

export type TargetUserContext = NonNullable<
  Awaited<ReturnType<typeof loadTargetUserContext>>
>;

export type RequestUserLocals = RequestUserContext | OptionalRequestUserContext;
export type { ServiceKeyIdentity };
export type { TargetTeamContext };
