import { appConfig } from "../../config/app.js";
import { env } from "../../config/env.js";

export function isAllowedAssetUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  if (value.startsWith(appConfig.uploads.staticImagesPath)) {
    return true;
  }
  if (value.startsWith(`${appConfig.publicOrigin}${appConfig.uploads.staticImagesPath}`)) {
    return true;
  }
  if (
    appConfig.mentionDomains.some((domain) =>
      value.startsWith(`http://${domain}`) || value.startsWith(`https://${domain}`),
    )
  ) {
    return (
      value.includes(
        `${appConfig.uploads.apiBasePath}/${appConfig.uploads.imageRoute}/`,
      ) ||
      value.includes(
        `${appConfig.uploads.apiBasePath}/${appConfig.uploads.profileImageRoute}/`,
      ) ||
      value.includes(appConfig.uploads.staticImagesPath)
    );
  }

  if (env.nodeEnv !== "production") {
    return value.startsWith("http://localhost:") || value.startsWith("http://127.0.0.1:");
  }

  return false;
}
