import {
  initializeFederationKeys,
  resumePendingFederationDeliveries,
} from "./services.js";
import { appConfig } from "../../config/app.js";

export async function startFederationRuntime() {
  if (!appConfig.federation.enabled) {
    return {
      name: "federation",
    };
  }

  await initializeFederationKeys();
  await resumePendingFederationDeliveries();

  return {
    name: "federation",
  };
}
