import { createRequire } from "node:module";

import { getRouteAuthMetadata } from "../contracts/auth-metadata.js";
import type { RouteAuthMetadata } from "../contracts/auth-metadata.js";
import { buildOpenApiDocument } from "../contracts/openapi.js";

const require = createRequire(import.meta.url);

type RouteParameter = {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type?: string } | Record<string, unknown>;
};

type ApiRegistryRoute = {
  method: string;
  path: string;
  tag: string;
  summary: string;
  parameters?: RouteParameter[];
  requestBody?: boolean;
  requestExample?: unknown;
  headers?: boolean;
  auth?: Partial<RouteAuthMetadata>;
  visibility?: "public" | "internal";
  idempotency?: { supported?: boolean; header?: string };
  pagination?: { style?: string; response?: string };
  rateLimit?: { documented?: boolean; headers?: boolean };
  deprecated?: boolean;
};

const apiRegistry = require("../contracts/api-registry.json") as {
  tags: Array<{ name: string }>;
  routes: ApiRegistryRoute[];
};

type VersionSummary = {
  version: string;
  docsPath: string;
  openApiPath: string;
  isCurrent: boolean;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getRouteId(route: ApiRegistryRoute) {
  return `${route.method.toLowerCase()}-${slugify(route.path)}`;
}

function isHiddenFromBrowsableDocs(route: ApiRegistryRoute) {
  if (route.visibility === "internal") {
    return true;
  }

  const method = route.method.toUpperCase();
  const key = `${method} ${route.path}`;

  if (route.tag === "Platform" || route.tag === "Admin") {
    return true;
  }

  if (route.path.startsWith("/platform/")) {
    return true;
  }

  return new Set([
    "POST /mod",
    "POST /documentation-document",
    "PUT /documentation-document",
    "DELETE /documentation-document",
    "POST /press-kit-media",
    "DELETE /press-kit-media",
    "POST /emojis",
  ]).has(key);
}

function describeParameter(parameter: RouteParameter) {
  const required =
    "required" in parameter && parameter.required ? "required" : "optional";
  const schemaType =
    typeof parameter.schema === "object" &&
    parameter.schema &&
    "type" in parameter.schema &&
    typeof parameter.schema.type === "string"
      ? parameter.schema.type
      : "string";

  return `${parameter.name} (${parameter.in}, ${schemaType}, ${required})`;
}

function buildVersionSummaries(
  currentVersion: string,
  supportedVersions: string[],
): VersionSummary[] {
  return supportedVersions.map((version) => ({
    version,
    docsPath: `/api/${version}`,
    openApiPath: `/api/${version}/openapi`,
    isCurrent: version === currentVersion,
  }));
}

function renderHtmlDocument(input: {
  title: string;
  body: string;
  script?: string;
  scriptNonce?: string;
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #000000;
        --sidebar: rgba(0, 0, 0, 0.96);
        --content: #1a1a1a;
        --content-stripe: rgba(0, 0, 0, 0.05);
        --header: rgba(0, 0, 0, 0.92);
        --base: #222222;
        --surface: rgba(34, 34, 34, 0.82);
        --surface-strong: rgba(0, 0, 0, 0.9);
        --surface-soft: rgba(255, 255, 255, 0.04);
        --line: rgba(255, 255, 255, 0.13);
        --line-soft: rgba(255, 255, 255, 0.08);
        --text: #ffffff;
        --muted: #939393;
        --red: #e95833;
        --orange: #fdb34e;
        --yellow: #f5dc42;
        --green: #5ef24e;
        --cyan: #4ef2ea;
        --blue: #4eb9f2;
        --indigo: #4e6ff2;
        --purple: #c64ef2;
        --pink: #ed4786;
        --accent: var(--blue);
        --accent-soft: rgba(78, 185, 242, 0.1);
        --accent-strong: var(--blue);
        --code: #4ef2ea;
        --control-bg: rgba(34, 34, 34, 0.7);
        --control-hover: rgba(34, 34, 34, 0.95);
        --control-active: rgba(78, 185, 242, 0.12);
        --control-border: rgba(255, 255, 255, 0.1);
        --control-border-hover: rgba(78, 185, 242, 0.65);
        --input-bg: rgba(0, 0, 0, 0.78);
        --chip-bg: rgba(34, 34, 34, 0.62);
        --chip-border: rgba(255, 255, 255, 0.1);
        --shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        background-color: var(--bg);
        color: var(--text);
      }
      a {
        color: inherit;
        text-decoration: none;
      }
      code,
      input,
      textarea {
        font-family: "Cascadia Code", "SFMono-Regular", monospace;
      }
      .docs-shell {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        background: var(--bg);
      }
      .sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        padding: 1.5rem 1rem 2rem;
        border-right: 1px solid var(--line);
        background: var(--sidebar);
        backdrop-filter: blur(10px);
        overflow-y: auto;
      }
      .sidebar-title {
        margin: 0 0 0.35rem;
        font-size: 1.4rem;
        font-weight: 800;
        letter-spacing: -0.03em;
      }
      .sidebar-copy {
        margin: 0 0 1.25rem;
        color: var(--muted);
        line-height: 1.45;
        font-size: 0.95rem;
      }
      .sidebar-section-title {
        margin: 1.35rem 0 0.55rem;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.73rem;
        font-weight: 700;
      }
      .nav-list,
      .subnav-list,
      .inline-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .sidebar-section {
        position: relative;
        margin-bottom: 0.7rem;
        padding: 0.25rem 0 0.15rem;
      }
      .nav-link,
      .subnav-link {
        display: block;
        border-radius: 8px;
        color: var(--muted);
        border: 1px solid var(--control-border);
        background: transparent;
        transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, transform 160ms ease;
      }
      .nav-link {
        padding: 0.72rem 0.95rem;
        font-weight: 600;
      }
      .subnav-list {
        position: relative;
        margin-top: 0.3rem;
        margin-left: 0.45rem;
        padding: 0.35rem 0 0.15rem 0.65rem;
      }
      .subnav-list::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0.3rem;
        bottom: 0.3rem;
        width: 1px;
        background: linear-gradient(
          to bottom,
          rgba(78, 185, 242, 0.08),
          rgba(78, 185, 242, 0.48),
          rgba(78, 185, 242, 0.08)
        );
      }
      .subnav-list li {
        position: relative;
      }
      .subnav-list li::before {
        content: "";
        position: absolute;
        left: -0.65rem;
        top: 50%;
        width: 0.4rem;
        height: 1px;
        background: rgba(78, 185, 242, 0.55);
        transform: translateY(-50%);
      }
      .subnav-link {
        padding: 0.48rem 0.72rem;
        font-size: 0.88rem;
        line-height: 1.35;
      }
      .nav-link:hover,
      .subnav-link:hover,
      .nav-link.active,
      .subnav-link.active {
        color: var(--text);
        border-color: var(--control-border-hover);
        background: var(--control-bg);
      }
      .subnav-link.active,
      .nav-link.active {
        border-color: var(--accent);
        background: var(--control-active);
        color: var(--text);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }
      .subnav-link {
        background: rgba(34, 34, 34, 0.42);
      }
      .content {
        min-width: 0;
        background-color: var(--content);
        background-image:
          repeating-linear-gradient(
            135deg,
            transparent 0px,
            transparent 40px,
            var(--content-stripe) 40px,
            var(--content-stripe) 80px
          );
        background-size: auto;
        background-position: 0 0;
      }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 2rem;
        border-bottom: 1px solid var(--line);
        background: var(--header);
        backdrop-filter: blur(10px);
      }
      .topbar-copy {
        color: var(--muted);
        font-size: 0.95rem;
      }
      .topbar-link {
        color: var(--accent-strong);
        font-weight: 700;
        transition: color 160ms ease;
      }
      .topbar-link:hover {
        color: var(--cyan);
      }
      .content-inner {
        width: min(980px, calc(100vw - 340px));
        margin: 0 auto;
        padding: 2rem 0 4rem;
      }
      .hero {
        padding: 0 0 2rem;
        border-bottom: 1px solid var(--line);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin-bottom: 0.85rem;
        color: var(--cyan);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.78rem;
        font-weight: 700;
      }
      h1,
      h2,
      h3,
      h4 {
        margin: 0;
        line-height: 1.08;
        letter-spacing: -0.03em;
      }
      h1 {
        font-size: clamp(2.4rem, 6vw, 4.6rem);
        margin-bottom: 0.9rem;
        font-weight: 900;
      }
      h2 {
        font-size: 1.6rem;
        margin-bottom: 0.9rem;
        font-weight: 900;
      }
      h3 {
        font-size: 1.08rem;
        margin-bottom: 0.35rem;
        font-weight: 800;
      }
      p {
        margin: 0 0 1rem;
        color: var(--muted);
        line-height: 1.7;
      }
      .lede {
        max-width: 62rem;
        font-size: 1.07rem;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
        margin-top: 1.35rem;
      }
      .summary-item {
        padding: 0.9rem 0;
        border-top: 1px solid var(--line);
      }
      .summary-item strong {
        display: block;
        margin-bottom: 0.35rem;
        color: var(--text);
        font-size: 0.92rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .inline-list li + li {
        margin-top: 0.5rem;
      }
      .inline-code {
        color: var(--code);
      }
      .section {
        padding: 2rem 0 0;
      }
      .route-block {
        padding: 1.45rem 0 1.55rem;
        border-top: 1px solid var(--line-soft);
        scroll-margin-top: 5.5rem;
      }
      .route-block:first-of-type {
        border-top: 0;
      }
      .route-head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-bottom: 0.7rem;
      }
      .method {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 4.2rem;
        padding: 0.28rem 0.55rem;
        border-radius: 999px;
        background: var(--chip-bg);
        color: var(--text);
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        border: 1px solid var(--chip-border);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }
      .method-get {
        background: rgba(94, 242, 78, 0.08);
        color: var(--green);
        border-color: rgba(94, 242, 78, 0.48);
      }
      .method-post {
        background: rgba(78, 185, 242, 0.08);
        color: var(--blue);
        border-color: rgba(78, 185, 242, 0.48);
      }
      .method-put {
        background: rgba(253, 179, 78, 0.08);
        color: var(--orange);
        border-color: rgba(253, 179, 78, 0.48);
      }
      .method-delete {
        background: rgba(233, 88, 51, 0.08);
        color: var(--red);
        border-color: rgba(233, 88, 51, 0.48);
      }
      .route-path {
        color: var(--text);
        font-size: 1.02rem;
        word-break: break-word;
      }
      .route-meta {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin: 0.75rem 0;
      }
      .route-meta span {
        color: var(--muted);
        font-size: 0.88rem;
      }
      .auth-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.28rem 0.55rem;
        border-radius: 999px;
        border: 1px solid rgba(78, 242, 234, 0.42);
        background: rgba(78, 242, 234, 0.07);
        color: var(--cyan);
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }
      .auth-pill-platform {
        border-color: rgba(245, 220, 66, 0.42);
        background: rgba(245, 220, 66, 0.07);
        color: var(--yellow);
      }
      .auth-panel {
        margin-top: 1.35rem;
        padding-top: 1rem;
        border-top: 1px solid var(--line);
      }
      .auth-form {
        display: grid;
        grid-template-columns: repeat(2, minmax(10rem, 1fr));
        gap: 0.75rem;
        align-items: end;
      }
      .auth-actions {
        grid-column: 1 / -1;
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .auth-form.is-logged-in label,
      .auth-form.is-logged-in [data-api-login-submit] {
        display: none;
      }
      .auth-form:not(.is-logged-in) [data-api-logout] {
        display: none;
      }
      .auth-form label {
        display: grid;
        gap: 0.35rem;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .auth-form input {
        width: 100%;
        border: 1px solid var(--control-border);
        background: var(--input-bg);
        color: var(--text);
        border-radius: 8px;
        padding: 0.7rem 0.75rem;
        font-size: 0.94rem;
      }
      .auth-form input:focus {
        outline: none;
        border-color: var(--control-border-hover);
        box-shadow: 0 0 0 1px rgba(78, 185, 242, 0.28);
      }
      .auth-status {
        margin-top: 0.7rem;
        color: var(--muted);
        font-size: 0.92rem;
      }
      .route-details {
        display: block;
      }
      .route-details > div {
        min-width: 0;
      }
      .field-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .field-list li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 0.72fr);
        gap: 1rem;
        align-items: center;
        padding: 0.65rem 0;
        border-top: 1px solid var(--line-soft);
      }
      .field-list li:first-child {
        border-top: 0;
        padding-top: 0;
      }
      .field-name {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        color: var(--text);
        font-weight: 700;
      }
      .required-marker {
        color: var(--red);
        font-size: 1rem;
        font-weight: 900;
        line-height: 1;
        text-shadow: none;
      }
      .required-label {
        color: var(--red);
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .field-meta {
        color: var(--muted);
        font-size: 0.92rem;
      }
      .query-builder {
        padding: 1.15rem 0 0;
        margin-top: 1rem;
        border-top: 1px solid var(--line-soft);
      }
      .builder-title {
        margin-bottom: 0.65rem;
        color: var(--text);
        font-size: 0.98rem;
        font-weight: 700;
      }
      .builder-grid {
        display: grid;
        gap: 0.75rem;
      }
      .builder-field input,
      .builder-field textarea {
        width: 100%;
        border: 1px solid var(--control-border);
        background: var(--input-bg);
        color: var(--text);
        border-radius: 8px;
        padding: 0.7rem 0.75rem;
        font-size: 0.94rem;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
      }
      .builder-field textarea {
        min-height: 6rem;
        resize: vertical;
      }
      .builder-field input:focus,
      .builder-field textarea:focus {
        outline: none;
        border-color: var(--control-border-hover);
        box-shadow: 0 0 0 1px rgba(78, 185, 242, 0.28);
      }
      .builder-output {
        margin-top: 1rem;
        padding: 0.85rem 0.95rem;
        border: 1px solid var(--control-border);
        background: var(--input-bg);
        border-radius: 8px;
        color: var(--code);
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
        min-height: 3.4rem;
      }
      .builder-actions {
        margin-top: 0.85rem;
      }
      .builder-button {
        border: 1px solid var(--control-border);
        background: var(--control-bg);
        color: var(--text);
        border-radius: 8px;
        padding: 0.7rem 1rem;
        font-size: 0.92rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
        cursor: pointer;
        transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, transform 160ms ease;
      }
      .builder-button:hover {
        border-color: var(--control-border-hover);
        background: var(--control-hover);
        color: var(--accent-strong);
        transform: translateY(-1px);
      }
      .builder-button:disabled {
        opacity: 0.6;
      }
      .builder-response {
        margin-top: 0.85rem;
      }
      .builder-response .builder-output {
        max-height: 22rem;
        overflow: auto;
      }
      .builder-note {
        margin-top: 0.55rem;
        font-size: 0.88rem;
        color: var(--muted);
      }
      .overview-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .overview-list li {
        padding: 0.7rem 0;
        border-top: 1px solid var(--line-soft);
        color: var(--muted);
      }
      .overview-list li:first-child {
        border-top: 0;
        padding-top: 0;
      }
      .overview-list strong {
        color: var(--text);
      }
      .versions-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1.25rem;
      }
      .versions-table th,
      .versions-table td {
        text-align: left;
        padding: 0.9rem 0;
        border-top: 1px solid var(--line-soft);
        vertical-align: top;
      }
      .versions-table th {
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .versions-table td {
        color: var(--muted);
      }
      .versions-table td strong {
        color: var(--text);
      }
      .plain-link {
        color: var(--accent-strong);
        font-weight: 700;
      }
      @media (max-width: 1080px) {
        .docs-shell {
          grid-template-columns: 1fr;
        }
        .sidebar {
          position: static;
          height: auto;
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }
        .content-inner {
          width: min(980px, calc(100vw - 2rem));
        }
      }
      @media (max-width: 800px) {
        .topbar {
          padding: 0.9rem 1rem;
          display: block;
        }
        .content-inner {
          width: calc(100vw - 2rem);
          padding: 1.35rem 0 3rem;
        }
        .field-list li {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    ${input.body}
    ${input.script ? `<script${input.scriptNonce ? ` nonce="${escapeHtml(input.scriptNonce)}"` : ""}>${input.script}</script>` : ""}
  </body>
</html>`;
}

function renderSidebar(input: {
  title: string;
  copy: string;
  groups: Array<{
    label: string;
    href: string;
    children?: Array<{ label: string; href: string }>;
  }>;
}) {
  return `
    <aside class="sidebar">
      <h2 class="sidebar-title">${escapeHtml(input.title)}</h2>
      <p class="sidebar-copy">${escapeHtml(input.copy)}</p>
      ${input.groups
        .map(
          (group) => `
            <div class="sidebar-section">
              <a class="nav-link" href="${escapeHtml(group.href)}">${escapeHtml(group.label)}</a>
              ${
                group.children?.length
                  ? `<ul class="subnav-list">
                      ${group.children
                        .map(
                          (child) => `
                            <li>
                              <a class="subnav-link" href="${escapeHtml(child.href)}">${escapeHtml(child.label)}</a>
                            </li>`,
                        )
                        .join("")}
                    </ul>`
                  : ""
              }
            </div>`,
        )
        .join("")}
    </aside>`;
}

export function renderApiLandingPage(input: {
  appName: string;
  currentVersion: string;
  supportedVersions: string[];
  deprecationPolicy: string;
  scriptNonce?: string;
}) {
  const versions = buildVersionSummaries(
    input.currentVersion,
    input.supportedVersions,
  );

  const body = `
    <div class="docs-shell" style="grid-template-columns: 1fr;">
      <div class="content">
        <div class="topbar">
          <div class="topbar-copy"></div>
        </div>
        <main class="content-inner">
          <section class="hero" id="overview">
            <div class="eyebrow">API index</div>
            <h1>${escapeHtml(input.appName)} API</h1>
            <div class="summary-grid">
              <div class="summary-item">
                <strong>Current version</strong>
                <div><code class="inline-code">${escapeHtml(input.currentVersion)}</code></div>
              </div>
              <div class="summary-item">
                <strong>Supported versions</strong>
                <div>${escapeHtml(input.supportedVersions.join(", "))}</div>
              </div>
            </div>
          </section>

          <section class="section" id="versions">
            <h2>Available Versions</h2>
            <p>Each version has two surfaces: a browsable docs page and a raw OpenAPI JSON document.</p>
            <table class="versions-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Docs</th>
                  <th>OpenAPI</th>
                </tr>
              </thead>
              <tbody>
                ${versions
                  .map(
                    (version) => `
                      <tr>
                        <td><strong>${escapeHtml(version.version)}</strong>${version.isCurrent ? ' <span class="eyebrow">Current</span>' : ""}</td>
                        <td><a class="plain-link" href="${escapeHtml(version.docsPath)}">${escapeHtml(version.docsPath)}</a></td>
                        <td><a class="plain-link" href="${escapeHtml(version.openApiPath)}">${escapeHtml(version.openApiPath)}</a></td>
                      </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
          </section>
        </main>
      </div>
    </div>`;

  return renderHtmlDocument({
    title: `${input.appName} API`,
    body,
    script: docsBehaviorScript(),
    scriptNonce: input.scriptNonce,
  });
}

function renderRouteBuilder(
  route: ApiRegistryRoute,
  version: string,
  publicOrigin: string,
) {
  const initialUrl = `${publicOrigin.replace(/\/$/, "")}/api/${version}${route.path}`;
  const hasInputs = Boolean((route.parameters?.length ?? 0) || route.requestBody);

  return `
    <div class="query-builder">
      ${hasInputs ? `<div class="builder-title">Build request</div>` : ""}
      <div
        class="builder-shell"
        data-route-builder
        data-route-path="${escapeHtml(`/api/${version}${route.path}`)}"
        data-route-method="${escapeHtml(route.method)}"
        data-route-origin="__ROUTE_ORIGIN__"
      >
        <pre class="builder-output" data-builder-url>${escapeHtml(initialUrl)}</pre>
        <div class="builder-actions">
          <button type="button" class="builder-button" data-builder-send>Send request</button>
        </div>
        <div class="builder-response" data-builder-response-wrap hidden>
          <pre class="builder-output" data-builder-response></pre>
        </div>
      </div>
    </div>`;
}

export function renderVersionDocsPage(input: {
  appName: string;
  version: string;
  tenant: unknown;
  publicOrigin: string;
  scriptNonce?: string;
}) {
  const document = buildOpenApiDocument({
    appName: input.appName,
    tenant: input.tenant,
  });

  const routesByTag = apiRegistry.tags
    .map((tag) => ({
      name: tag.name,
      id: slugify(tag.name),
      routes: apiRegistry.routes.filter(
        (route) =>
          route.tag === tag.name && !isHiddenFromBrowsableDocs(route),
      ),
    }))
    .filter((group) => group.routes.length > 0);

  const sidebarGroups = [
    {
      label: "Overview",
      href: "#overview",
    },
    ...routesByTag.map((group) => ({
      label: group.name,
      href: `#tag-${group.id}`,
      children: group.routes.map((route) => ({
        label: `${route.method} ${route.path}`,
        href: `#${getRouteId(route)}`,
      })),
    })),
  ];

  const body = `
    <div class="docs-shell">
      ${renderSidebar({
        title: `${input.appName} ${input.version}`,
        copy: "",
        groups: sidebarGroups,
      })}
      <div class="content">
        <div class="topbar">
          <div class="topbar-copy"></div>
          <a class="topbar-link" href="/api/${escapeHtml(input.version)}/openapi">OpenAPI JSON</a>
        </div>
        <main class="content-inner">
          <section class="hero" id="overview">
            <div class="eyebrow">API ${escapeHtml(input.version)}</div>
            <h1>${escapeHtml(input.appName)} ${escapeHtml(input.version)} Documentation</h1>
            <p class="lede">${escapeHtml(String(document.info.description ?? ""))}</p>
            <div class="auth-panel">
              <h2>API Login</h2>
              <form class="auth-form" data-api-login-form>
                <label>
                  Username
                  <input type="text" name="username" autocomplete="username">
                </label>
                <label>
                  Password
                  <input type="password" name="password" autocomplete="current-password">
                </label>
                <div class="auth-actions">
                  <button type="submit" class="builder-button" data-api-login-submit>Log in</button>
                  <button type="button" class="builder-button" data-api-logout>Log out</button>
                </div>
              </form>
              <div class="auth-status" data-api-auth-status>Not logged in for API requests.</div>
            </div>
          </section>
          ${routesByTag
            .map(
              (group) => `
                <section class="section" id="tag-${group.id}">
                  <h2>${escapeHtml(group.name)}</h2>
                  <p>${group.routes.length} endpoint${group.routes.length === 1 ? "" : "s"} in this category.</p>
                  ${group.routes
                    .map((route) => {
                      const parameters = route.parameters ?? [];
                      const auth = getRouteAuthMetadata(route);
                      return `
                        <article class="route-block" id="${escapeHtml(getRouteId(route))}">
                          <div class="route-head">
                            <span class="method method-${escapeHtml(route.method.toLowerCase())}">${escapeHtml(route.method)}</span>
                            ${auth.required ? `<span class="auth-pill${auth.kind === "platform" ? " auth-pill-platform" : ""}">${escapeHtml(auth.label)}</span>` : ""}
                            ${auth.optional ? `<span class="auth-pill">${escapeHtml(auth.label)}</span>` : ""}
                            ${route.deprecated ? `<span class="auth-pill auth-pill-platform">Deprecated</span>` : ""}
                            <code class="route-path">/api/${escapeHtml(input.version)}${escapeHtml(route.path)}</code>
                          </div>
                          <h3>${escapeHtml(route.summary)}</h3>
                          <div class="route-meta">
                            ${route.requestBody ? "<span>Accepts JSON body</span>" : ""}
                            ${route.headers ? "<span>Requires headers/service auth context</span>" : ""}
                            ${route.pagination ? "<span>Cursor pagination</span>" : ""}
                            ${route.idempotency?.supported ? `<span>Supports ${escapeHtml(route.idempotency.header ?? "Idempotency-Key")}</span>` : ""}
                            ${route.rateLimit?.headers ? "<span>Returns rate-limit headers</span>" : ""}
                          </div>
                          <div class="route-details">
                            <div>
                              ${
                                parameters.length || route.requestBody
                                  ? `<div class="builder-title">Inputs</div><ul class="field-list">
                                      ${parameters
                                        .map(
                                          (parameter) => `
                                            <li>
                                              <div>
                                                <div class="field-name">
                                                  ${escapeHtml(parameter.name)}
                                                  ${parameter.required ? `<span class="required-marker" aria-label="required">*</span><span class="required-label">Required</span>` : ""}
                                                </div>
                                                <div class="field-meta">${escapeHtml(describeParameter(parameter))}</div>
                                              </div>
                                              <div class="builder-field">
                                                <input
                                                  id="${escapeHtml(`${getRouteId(route)}-${parameter.name}`)}"
                                                  type="text"
                                                  data-param-name="${escapeHtml(parameter.name)}"
                                                  data-param-in="${escapeHtml(parameter.in)}"
                                                  ${parameter.required ? "required" : ""}
                                                  placeholder="${escapeHtml(parameter.name)}"
                                                >
                                              </div>
                                            </li>`,
                                        )
                                        .join("")}
                                      ${
                                        route.requestBody
                                          ? `
                                            <li>
                                              <div>
                                                <div class="field-name">body <span class="required-marker" aria-label="required">*</span><span class="required-label">Required</span></div>
                                                <div class="field-meta">request body, JSON, required</div>
                                              </div>
                                              <div class="builder-field">
                                                <textarea id="${escapeHtml(`${getRouteId(route)}-body`)}" data-param-body="true" placeholder="JSON body" required></textarea>
                                              </div>
                                          </li>`
                                        : ""
                                    }
                                  </ul>`
                                  : ``
                              }
                            </div>
                          </div>
                          ${renderRouteBuilder(route, input.version, input.publicOrigin)}
                        </article>`;
                    })
                    .join("")}
                </section>`,
            )
            .join("")}
        </main>
      </div>
    </div>`;

  return renderHtmlDocument({
    title: `${input.appName} ${input.version} API docs`,
    body: body.replaceAll("__ROUTE_ORIGIN__", escapeHtml(input.publicOrigin)),
    script: docsBehaviorScript(),
    scriptNonce: input.scriptNonce,
  });
}

function docsBehaviorScript() {
  return `
    (() => {
      const builders = Array.from(document.querySelectorAll("[data-route-builder]"));
      const authStorageKey = "jamcore.docs.accessToken";
      const apiVersion = (window.location.pathname.match(/^\\/api\\/([^/]+)/) || [null, "v1"])[1];

      function getAccessToken() {
        return window.localStorage.getItem(authStorageKey) || "";
      }

      function setAccessToken(value) {
        if (value) {
          window.localStorage.setItem(authStorageKey, value);
        } else {
          window.localStorage.removeItem(authStorageKey);
        }
        updateAuthStatus();
      }

      function updateAuthStatus(message) {
        const status = document.querySelector("[data-api-auth-status]");
        const loginForm = document.querySelector("[data-api-login-form]");
        if (loginForm) {
          loginForm.classList.toggle("is-logged-in", Boolean(getAccessToken()));
        }
        if (!status) {
          return;
        }
        if (message) {
          status.textContent = message;
          return;
        }
        status.textContent = getAccessToken()
          ? "Logged in for API requests on this docs page."
          : "Not logged in for API requests.";
      }

      function getBuilderFields(builder) {
        const routeBlock = builder.closest(".route-block");
        if (!routeBlock) {
          return [];
        }
        return Array.from(routeBlock.querySelectorAll("input[data-param-name], textarea[data-param-body]"));
      }

      function getBuilderState(builder) {
        const origin = builder.getAttribute("data-route-origin") || window.location.origin;
        const pathTemplate = builder.getAttribute("data-route-path") || "";
        const method = builder.getAttribute("data-route-method") || "GET";
        let path = pathTemplate;
        const query = new URLSearchParams();

        for (const input of getBuilderFields(builder).filter((field) => field.matches("input[data-param-name]"))) {
          const name = input.getAttribute("data-param-name");
          const location = input.getAttribute("data-param-in");
          const value = input.value.trim();
          if (!name || !value) {
            continue;
          }

          if (location === "path") {
            path = path.replace("{" + name + "}", encodeURIComponent(value));
          } else if (location === "query") {
            query.set(name, value);
          }
        }

        const queryString = query.toString();
        const bodyField = getBuilderFields(builder).find((field) => field.matches("textarea[data-param-body]"));
        const bodyText = bodyField ? bodyField.value.trim() : "";
        const relativeUrl = path + (queryString ? "?" + queryString : "");
        const url = origin.replace(/\\/$/, "") + relativeUrl;

        return {
          method,
          url,
          relativeUrl,
          bodyText,
        };
      }

      function updateBuilder(builder) {
        const state = getBuilderState(builder);
        const output = builder.querySelector("[data-builder-url]");
        if (!output) {
          return;
        }

        output.textContent = state.url;
      }

      async function sendBuilderRequest(builder) {
        const state = getBuilderState(builder);
        const responseOutput = builder.querySelector("[data-builder-response]");
        const responseWrap = builder.querySelector("[data-builder-response-wrap]");
        const sendButton = builder.querySelector("[data-builder-send]");
        if (!responseOutput || !responseWrap || !sendButton) {
          return;
        }

        let body = undefined;
        const headers = {};
        if (state.bodyText) {
          body = state.bodyText;
          headers["Content-Type"] = "application/json";
        }
        const accessToken = getAccessToken();
        if (accessToken) {
          headers.Authorization = "Bearer " + accessToken;
        }

        sendButton.disabled = true;
        const originalLabel = sendButton.textContent;
        sendButton.textContent = "Sending...";
        responseWrap.hidden = false;
        responseOutput.textContent = "";

        try {
          const response = await fetch(state.url, {
            method: state.method,
            headers,
            body,
            credentials: "include",
          });

          const raw = await response.text();
          let pretty = raw;
          try {
            pretty = JSON.stringify(JSON.parse(raw), null, 2);
          } catch {
            // Keep non-JSON responses as-is.
          }

          responseOutput.textContent =
            (response.status + " " + response.statusText + "\\n\\n" + (pretty || "(empty response)"));
        } catch (error) {
          responseOutput.textContent =
            error instanceof Error ? error.message : String(error);
        } finally {
          sendButton.disabled = false;
          sendButton.textContent = originalLabel || "Send request";
        }
      }

      for (const builder of builders) {
        for (const field of getBuilderFields(builder)) {
          field.addEventListener("input", () => updateBuilder(builder));
        }
        const sendButton = builder.querySelector("[data-builder-send]");
        if (sendButton) {
          sendButton.addEventListener("click", () => {
            void sendBuilderRequest(builder);
          });
        }
        updateBuilder(builder);
      }

      const loginForm = document.querySelector("[data-api-login-form]");
      if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(loginForm);
          updateAuthStatus("Logging in...");
          try {
            const response = await fetch(window.location.origin + "/api/" + apiVersion + "/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                username: String(formData.get("username") || ""),
                password: String(formData.get("password") || ""),
              }),
            });
            const authorization = response.headers.get("Authorization");
            const json = await response.json().catch(() => null);
            const token = authorization || json?.data?.token || json?.token || "";
            if (!response.ok || !token) {
              throw new Error(json?.error?.message || json?.message || "Login failed");
            }
            setAccessToken(token);
            loginForm.reset();
          } catch (error) {
            updateAuthStatus(error instanceof Error ? error.message : String(error));
          }
        });
      }

      const logoutButton = document.querySelector("[data-api-logout]");
      if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
          setAccessToken("");
          await fetch(window.location.origin + "/api/" + apiVersion + "/session", {
            method: "DELETE",
            credentials: "include",
          }).catch(() => undefined);
          updateAuthStatus();
        });
      }
      updateAuthStatus();

      const navLinks = Array.from(document.querySelectorAll(".nav-link, .subnav-link"));
      const sections = navLinks
        .map((link) => {
          const href = link.getAttribute("href");
          if (!href || !href.startsWith("#")) {
            return null;
          }
          const target = document.querySelector(href);
          return target ? { link, target } : null;
        })
        .filter(Boolean);

      if (!sections.length || !("IntersectionObserver" in window)) {
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const href = "#" + entry.target.id;
          const link = navLinks.find((candidate) => candidate.getAttribute("href") === href);
          if (!link) {
            continue;
          }
          if (entry.isIntersecting) {
            navLinks.forEach((candidate) => candidate.classList.remove("active"));
            link.classList.add("active");
          }
        }
      }, {
        rootMargin: "-20% 0px -65% 0px",
        threshold: 0.01,
      });

      for (const section of sections) {
        observer.observe(section.target);
      }
    })();
  `;
}
