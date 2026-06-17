import { appConfig } from "../../config/app.js";
import { env } from "../../config/env.js";

function isUploadApiPath(pathname: string) {
  const apiBasePath = appConfig.uploads.apiBasePath.replace(/\/$/, "");
  return (
    pathname.startsWith(
      `${apiBasePath}/${appConfig.uploads.imageRoute}/`,
    ) ||
    pathname.startsWith(
      `${apiBasePath}/${appConfig.uploads.profileImageRoute}/`,
    )
  );
}

export function isAllowedAssetUrl(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  if (isUploadApiPath(value)) return true;
  if (value.startsWith(appConfig.uploads.staticImagesPath)) {
    return true;
  }
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      isUploadApiPath(parsed.pathname)
    ) {
      return true;
    }
  } catch {
    // Relative URLs are handled above.
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
