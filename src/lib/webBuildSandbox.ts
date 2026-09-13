export function webBuildSandbox(
  requestOrigin: string,
  buildOrigin: string | undefined,
  clientOrigin: string,
  apiOrigin: string,
) {
  const restricted = "allow-scripts allow-pointer-lock";
  if (!buildOrigin) return restricted;
  try {
    const build = new URL(buildOrigin);
    if (
      build.protocol === "https:" &&
      build.origin === new URL(requestOrigin).origin &&
      build.origin !== new URL(clientOrigin).origin &&
      build.origin !== new URL(apiOrigin).origin
    ) {
      return `${restricted} allow-same-origin`;
    }
  } catch {
    // Invalid or missing host configuration must retain the opaque origin.
  }
  return restricted;
}
