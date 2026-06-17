import {
  createCollectionsRouter,
} from "../../features/collections/router.js";
import {
  createContentAdminRouter,
} from "../../features/content-admin/router.js";
import { createEventsRouter } from "../../features/events/router.js";
import { createGamesRouter } from "../../features/games/router.js";
import { createJamsRouter } from "../../features/jams/router.js";
import { createPostsRouter } from "../../features/posts/router.js";
import { createQuiltsRouter } from "../../features/quilts/router.js";
import { createRadioRouter } from "../../features/radio/router.js";
import { createTeamsRouter } from "../../features/teams/router.js";
import { createThemesRouter } from "../../features/themes/router.js";
import { createUsersRouter } from "../../features/users/router.js";

export type StaticRouteRegistration = {
  path: string;
  router: unknown;
};

export function getStaticV1Routes(): StaticRouteRegistration[] {
  return [
    { path: "/events", router: createEventsRouter() },
    { path: "/collections", router: createCollectionsRouter() },
    { path: "/games", router: createGamesRouter() },
    { path: "/jams", router: createJamsRouter() },
    { path: "/posts", router: createPostsRouter() },
    { path: "/quilts", router: createQuiltsRouter() },
    { path: "/radio", router: createRadioRouter() },
    { path: "/teams", router: createTeamsRouter() },
    { path: "/themes", router: createThemesRouter() },
    { path: "/users", router: createUsersRouter() },
    { path: "/", router: createContentAdminRouter() },
  ];
}
