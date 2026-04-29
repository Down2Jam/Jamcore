import {
  configureHttpErrorHandling,
  configureHttpMiddleware,
  createHttpApp,
  mountHttpRoutes,
} from "./runtime/http.js";

export async function createApp() {
  const app = createHttpApp();

  configureHttpMiddleware(app);
  await mountHttpRoutes(app);
  configureHttpErrorHandling(app);

  return app;
}
