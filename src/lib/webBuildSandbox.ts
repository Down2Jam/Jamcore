export function webBuildSandbox(
  requestOrigin: string,
  buildOrigin: string | undefined,
  clientOrigin: string,
  apiOrigin: string,
) {
  // Device authorization opens the main site in a new tab. That tab must not
  // inherit the game's opaque origin or restrictions on forms and cookies.
  const restricted = "allow-scripts allow-pointer-lock allow-popups allow-popups-to-escape-sandbox";
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
