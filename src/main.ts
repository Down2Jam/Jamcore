import { bootstrapApplication } from "./runtime/bootstrap.js";
import { installRuntimeShutdown } from "./runtime/shutdown.js";

const runtime = await bootstrapApplication();
installRuntimeShutdown(runtime);
