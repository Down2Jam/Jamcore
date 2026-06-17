type RouteLike = {
  method: string;
  path: string;
  headers?: boolean;
  auth?: Partial<RouteAuthMetadata>;
};

export type RouteAuthMetadata = {
  required: boolean;
  optional: boolean;
  kind: "none" | "user" | "platform";
  label: string;
};

const publicMutationRoutes = new Set([
  "POST /session",
  "DELETE /session",
  "POST /users",
]);

const requiredUserGetRoutes = new Set([
  "GET /admin/images",
  "GET /jams/{jamSlug}/participation",
  "GET /notifications",
  "GET /notifications/preferences",
  "GET /posts/{postSlug}/revisions",
  "GET /posts/autosave",
  "GET /self",
  "GET /self/current-game",
  "GET /themes",
  "GET /themes/suggestion",
  "GET /themes/votes",
]);

const optionalUserGetPrefixes = [
  "/collections",
  "/games/",
  "/posts",
  "/radio",
  "/recap",
  "/results",
  "/tracks",
];

function routeKey(route: RouteLike) {
  return `${route.method.toUpperCase()} ${route.path}`;
}

export function getRouteAuthMetadata(route: RouteLike): RouteAuthMetadata {
  if (route.auth?.kind) {
    return {
      required: Boolean(route.auth.required),
      optional: Boolean(route.auth.optional),
      kind: route.auth.kind,
      label:
        route.auth.label ??
        (route.auth.required
          ? route.auth.kind === "platform"
            ? "Requires platform auth"
            : "Requires user login"
          : route.auth.optional
            ? "Uses login if present"
            : "Public"),
    };
  }

  const method = route.method.toUpperCase();
  const key = routeKey(route);

  if (route.headers) {
    return {
      required: true,
      optional: false,
      kind: "platform",
      label: "Requires platform auth",
    };
  }

  if (requiredUserGetRoutes.has(key)) {
    return {
      required: true,
      optional: false,
      kind: "user",
      label: "Requires user login",
    };
  }

  if (method !== "GET" && !publicMutationRoutes.has(key)) {
    return {
      required: true,
      optional: false,
      kind: "user",
      label: "Requires user login",
    };
  }

  if (
    method === "GET" &&
    optionalUserGetPrefixes.some((prefix) => route.path.startsWith(prefix))
  ) {
    return {
      required: false,
      optional: true,
      kind: "user",
      label: "Uses login if present",
    };
  }

  return {
    required: false,
    optional: false,
    kind: "none",
    label: "Public",
  };
}
