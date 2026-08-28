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

function getBrowsableDocsRoutes() {
  return apiRegistry.routes.filter((route) => !isHiddenFromBrowsableDocs(route));
}

export function hasBrowsableDocsRoute(routeId: string) {
  return getBrowsableDocsRoutes().some((route) => getRouteId(route) === routeId);
}

function describeDocsParameter(parameter: RouteParameter) {
  const descriptions: Record<string, string> = {
    sort: "Sort order",
    jamSlug: "Filter by jam slug",
    jamId: "Filter by jam id",
    pageVersion: "Page version",
    cursor: "Cursor for pagination",
    limit: "Maximum results per page",
  };

  return descriptions[parameter.name] ?? `${parameter.in} parameter`;
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
        --bg: #111519;
        --sidebar: #111519;
        --content: #181c20;
        --header: #181c20;
        --base: #20252a;
        --surface: #181c20;
        --surface-strong: #111519;
        --surface-soft: #1d2227;
        --line: #30363b;
        --line-soft: #282e33;
        --text: #f0f2f1;
        --muted: #a2a9b0;
        --red: #e95833;
        --orange: #fdb34e;
        --yellow: #f5dc42;
        --green: #67e06d;
        --cyan: #4ef2ea;
        --blue: #4eb9f2;
        --indigo: #4e6ff2;
        --purple: #c64ef2;
        --pink: #ed4786;
        --accent: var(--green);
        --accent-soft: rgba(103, 224, 109, 0.1);
        --accent-strong: var(--green);
        --action: #58bd5d;
        --code: #72df7a;
        --control-bg: #1b2125;
        --control-hover: #20282c;
        --control-active: #223b2a;
        --control-border: #363d42;
        --control-border-hover: rgba(103, 224, 109, 0.65);
        --input-bg: #12171a;
        --chip-bg: #1d2227;
        --chip-border: #363d42;
        --docs-gutter: clamp(2.5rem, 4vw, 4.5rem);
      }
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
        grid-template-columns: 308px minmax(0, 1fr);
        background: var(--bg);
      }
      .docs-workspace {
        min-width: 0;
        background: var(--content);
      }
      .docs-content-grid {
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }
      .docs-content-grid.has-request-rail {
        grid-template-columns: minmax(560px, 1fr) minmax(460px, 31.25vw);
      }
      .sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        padding: 1.25rem 0.75rem 2rem;
        border-right: 1px solid var(--line);
        background: var(--sidebar);
        overflow-y: auto;
        scrollbar-width: none;
      }
      .sidebar::-webkit-scrollbar { width: 0; height: 0; }
      .sidebar-title {
        margin: 0;
        padding: 0;
        font-size: 1.05rem;
        font-weight: 700;
        letter-spacing: -0.015em;
      }
      .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 0.65rem;
      }
      .sidebar-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.8rem;
        height: 1.8rem;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
      }
      .sidebar-toggle:hover { color: var(--text); }
      .sidebar-toggle:focus { outline: none; }
      .sidebar-toggle:focus-visible {
        outline: 1px solid var(--accent);
        outline-offset: 2px;
      }
      .sidebar-toggle svg {
        width: 1.3rem;
        height: 1.3rem;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
      }
      .docs-shell.sidebar-collapsed {
        grid-template-columns: 0 minmax(0, 1fr);
      }
      .docs-shell.sidebar-collapsed .sidebar {
        position: relative;
        width: 0;
        min-width: 0;
        height: 0;
        padding: 0;
        border: 0;
        overflow: visible;
      }
      .docs-shell.sidebar-collapsed .sidebar-header {
        width: 0;
        height: 0;
        padding: 0;
      }
      .docs-shell.sidebar-collapsed .sidebar-title,
      .docs-shell.sidebar-collapsed .sidebar-copy,
      .docs-shell.sidebar-collapsed .docs-search-wrap,
      .docs-shell.sidebar-collapsed .sidebar-section {
        display: none;
      }
      .docs-shell.sidebar-collapsed .sidebar-toggle {
        position: fixed;
        z-index: 50;
        top: 1rem;
        left: 0;
        width: 2rem;
        height: 2.25rem;
        border: 1px solid var(--line);
        border-left: 0;
        border-radius: 0 4px 4px 0;
        background: var(--sidebar);
      }
      .docs-shell.sidebar-collapsed .sidebar-toggle svg {
        transform: rotate(180deg);
      }
      .sidebar-copy {
        margin: 0 0 1rem;
        color: var(--muted);
        line-height: 1.45;
        font-size: 0.95rem;
      }
      .docs-search-wrap {
        position: relative;
        display: flex;
        align-items: center;
        margin: 1.25rem 0.1rem 0.7rem;
      }
      .docs-search-wrap svg {
        position: absolute;
        left: 0.7rem;
        width: 1rem;
        height: 1rem;
        fill: none;
        stroke: var(--muted);
        stroke-width: 1.6;
      }
      .docs-search-wrap kbd {
        position: absolute;
        right: 0.55rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.35rem;
        height: 1.35rem;
        border: 1px solid var(--control-border);
        border-radius: 3px;
        color: var(--muted);
        font: 0.72rem "Cascadia Code", monospace;
      }
      .docs-search {
        width: 100%;
        margin: 0;
        padding: 0.58rem 2.35rem 0.58rem 2.15rem;
        border: 1px solid var(--control-border);
        border-radius: 4px;
        background: var(--input-bg);
        color: var(--text);
        font: inherit;
        font-size: 0.84rem;
      }
      .docs-search:focus {
        outline: 2px solid var(--accent-soft);
        border-color: var(--accent);
      }
      .docs-search::placeholder { color: var(--muted); }
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
        margin-bottom: 0.8rem;
        padding: 0.1rem 0;
      }
      .nav-link,
      .subnav-link {
        display: block;
        border-radius: 6px;
        color: var(--muted);
        border: 1px solid transparent;
        background: transparent;
        transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, transform 160ms ease;
      }
      .nav-link {
        padding: 0.58rem 0.7rem;
        font-weight: 600;
      }
      .nav-section-label {
        display: block;
        padding-top: 0.75rem;
        padding-bottom: 0.3rem;
        padding-left: 0.7rem;
        padding-right: 0.7rem;
        color: var(--muted);
        font-size: 0.72rem;
        font-weight: 750;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        cursor: default;
        user-select: none;
      }
      .subnav-list {
        position: relative;
        margin-top: 0.2rem;
        margin-left: 0.5rem;
        padding: 0.2rem 0 0.1rem 0.65rem;
      }
      .subnav-list::before {
        content: "";
        position: absolute;
        z-index: 2;
        left: 0;
        top: 0.3rem;
        bottom: 0.3rem;
        width: 3px;
        background: var(--line);
        pointer-events: none;
      }
      .subnav-list li {
        position: relative;
      }
      .subnav-list li.sidebar-route-get {
        --route-active-color: var(--green);
        --route-active-bg: rgba(103, 224, 109, 0.16);
      }
      .subnav-list li.sidebar-route-post {
        --route-active-color: var(--blue);
        --route-active-bg: rgba(78, 185, 242, 0.16);
      }
      .subnav-list li.sidebar-route-put {
        --route-active-color: var(--orange);
        --route-active-bg: rgba(253, 179, 78, 0.16);
      }
      .subnav-list li.sidebar-route-delete {
        --route-active-color: var(--red);
        --route-active-bg: rgba(233, 88, 51, 0.16);
      }
      .subnav-list li::before {
        content: none;
      }
      .subnav-list li:has(.subnav-link.active)::before {
        content: "";
        position: absolute;
        z-index: 3;
        left: -0.65rem;
        top: 0;
        bottom: 0;
        width: 3px;
        height: auto;
        background: var(--route-active-color, var(--accent));
        transform: none;
      }
      .subnav-link {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        margin-left: -0.65rem;
        padding: 0.38rem 0.55rem 0.38rem 1.2rem;
        border-radius: 0 4px 4px 0;
        font-size: 0.82rem;
        line-height: 1.35;
      }
      .nav-link:hover,
      .subnav-link:hover,
      .nav-link.active,
      .subnav-link.active {
        color: var(--text);
        border-color: transparent;
        background: var(--control-bg);
      }
      .subnav-link.active,
      .nav-link.active {
        border-color: transparent;
        background: var(--control-active);
        color: var(--text);
        box-shadow: none;
      }
      .subnav-link.active {
        background: var(--route-active-bg, var(--control-active));
      }
      .subnav-link {
        background: transparent;
      }
      .sidebar-method {
        width: 2.45rem;
        flex: none;
        color: var(--muted);
        font-family: "Cascadia Code", "SFMono-Regular", monospace;
        font-size: 0.66rem;
        font-weight: 800;
      }
      .sidebar-method-get { color: var(--green); }
      .sidebar-method-post { color: var(--blue); }
      .sidebar-method-put { color: var(--orange); }
      .sidebar-method-delete { color: var(--red); }
      .sidebar-path {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .content {
        min-width: 0;
        background-color: var(--content);
        background-image: none;
      }
      .request-rail {
        position: sticky;
        top: 3.5rem;
        height: calc(100vh - 3.5rem);
        padding: 2rem 2rem 3rem;
        border-left: 1px solid var(--line);
        background: var(--sidebar);
        overflow-y: auto;
      }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        min-height: 3.5rem;
        align-items: center;
        padding: 0.75rem 2rem 0.75rem var(--docs-gutter);
        border-bottom: 1px solid var(--line);
        background: var(--header);
      }
      .endpoint-topbar {
        border-bottom: 0;
      }
      .topbar:has(+ .docs-content-grid.has-request-rail) {
        border-bottom: 0;
      }
      .topbar::after {
        content: "";
        position: absolute;
        z-index: -1;
        top: 0;
        right: 0;
        bottom: 0;
        width: 31.25vw;
        border-left: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
        background: var(--sidebar);
      }
      .topbar:not(:has(+ .docs-content-grid.has-request-rail))::after {
        display: none;
      }
      .topbar-copy {
        display: flex;
        align-items: baseline;
        gap: 0.55rem;
        color: var(--muted);
        font-size: 0.95rem;
      }
      .topbar-category { color: var(--accent-strong); }
      .breadcrumb-separator {
        color: #555b63;
        font-size: 1.25rem;
        line-height: 1;
      }
      .topbar-category,
      .topbar-copy code {
        line-height: 1;
      }
      .topbar-copy code { color: var(--muted); }
      .endpoint-topbar .topbar-copy {
        transform: translateY(1.5rem);
      }
      .topbar-link {
        color: var(--accent-strong);
        font-weight: 700;
        transition: color 160ms ease;
      }
      .topbar-link:hover {
        color: var(--text);
      }
      .topbar-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      .content-inner {
        width: min(780px, calc(100% - 5rem));
        margin: 0 auto 0 var(--docs-gutter);
        padding: 2.5rem 0 5rem;
      }
      .docs-content-grid.has-request-rail .content-inner {
        padding-top: 2.5rem;
      }
      .hero {
        padding: 0 0 2.5rem;
        border-bottom: 1px solid var(--line);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin-bottom: 0.85rem;
        color: var(--accent-strong);
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
        font-size: clamp(2rem, 2.5vw, 2.25rem);
        margin-bottom: 0.9rem;
        font-weight: 750;
      }
      h2 {
        font-size: 1.6rem;
        margin-bottom: 0.9rem;
        font-weight: 750;
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
        padding: 2.75rem 0 0;
      }
      .endpoint-page {
        max-width: 820px;
      }
      .endpoint-page > h1 {
        font-size: 1.75rem;
        line-height: 1.15;
      }
      .overview-page > .hero {
        padding-bottom: 2rem;
      }
      .overview-page h1 {
        font-size: 1.75rem;
        line-height: 1.15;
      }
      .overview-page > .section {
        padding-top: 2.5rem;
      }
      .overview-page > .section > h2 {
        margin-bottom: 0.75rem;
        font-size: 1.25rem;
      }
      .overview-page .endpoint-index-group {
        padding-top: 2.5rem;
      }
      .endpoint-index-group {
        padding: 2rem 0 0;
      }
      .endpoint-index-group h3 {
        padding-bottom: 0.8rem;
        border-bottom: 1px solid var(--line);
      }
      .endpoint-index-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .endpoint-index-list li {
        border-bottom: 1px solid var(--line-soft);
      }
      .endpoint-index-list a {
        display: grid;
        grid-template-columns: 3.25rem minmax(12rem, 0.75fr) minmax(14rem, 1fr);
        gap: 1rem;
        align-items: center;
        padding: 0.85rem 0;
        color: var(--muted);
      }
      .endpoint-index-list a:hover {
        color: var(--text);
      }
      .endpoint-index-list code {
        color: var(--text);
        overflow-wrap: anywhere;
      }
      .endpoint-index-list .sidebar-method {
        width: auto;
      }
      .route-block {
        margin-top: 1.5rem;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        scroll-margin-top: 5.5rem;
      }
      .route-block:first-of-type {
        border: 0;
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
        min-width: 0;
        padding: 0;
        border-radius: 0;
        background: transparent;
        color: var(--text);
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        border: 0;
        box-shadow: none;
      }
      .method-get {
        background: transparent;
        color: var(--green);
      }
      .method-post {
        background: transparent;
        color: var(--blue);
      }
      .method-put {
        background: transparent;
        color: var(--orange);
      }
      .method-delete {
        background: transparent;
        color: var(--red);
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
        margin: 0.75rem 0 0;
        padding-bottom: 2rem;
        border-bottom: 1px solid var(--line);
      }
      .route-meta span {
        color: var(--muted);
        font-size: 0.88rem;
      }
      .route-meta span:not(:last-child)::after {
        content: "·";
        margin-left: 0.75rem;
        color: #555b63;
      }
      .auth-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border-radius: 0;
        border: 0;
        background: transparent;
        color: var(--cyan);
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        box-shadow: none;
      }
      .auth-pill-platform {
        background: transparent;
        color: var(--yellow);
      }
      .auth-panel {
        margin-top: 1.5rem;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
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
        border-radius: 6px;
        padding: 0.7rem 0.75rem;
        font-size: 0.94rem;
      }
      .auth-form input:focus {
        outline: none;
        border-color: var(--control-border-hover);
        box-shadow: 0 0 0 1px rgba(103, 224, 109, 0.28);
      }
      .auth-status {
        margin-top: 0.7rem;
        color: var(--muted);
        font-size: 0.92rem;
      }
      .route-details {
        display: block;
        margin-top: 2.5rem;
        padding-top: 0;
        border-top: 0;
      }
      .route-details h2 {
        margin-bottom: 1.25rem;
        font-size: 1.25rem;
      }
      .parameters-scroll {
        width: 100%;
        overflow-x: auto;
      }
      .parameters-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .parameters-table th,
      .parameters-table td {
        padding: 1rem 0.65rem;
        border-bottom: 1px solid var(--line-soft);
        text-align: left;
        vertical-align: middle;
      }
      .parameters-table th:first-child,
      .parameters-table td:first-child { padding-left: 0; }
      .parameters-table th:last-child,
      .parameters-table td:last-child { padding-right: 0; }
      .parameters-table th {
        color: var(--muted);
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .parameters-table td {
        color: var(--muted);
        font-size: 0.88rem;
      }
      .parameters-table td:first-child,
      .parameters-table td:first-child code {
        color: var(--text);
        font-weight: 700;
      }
      .parameters-table th:nth-child(1) { width: 19%; }
      .parameters-table th:nth-child(2) { width: 13%; }
      .parameters-table th:nth-child(3) { width: 36%; }
      .parameters-table th:nth-child(4) { width: 17%; }
      .parameters-table th:nth-child(5) { width: 15%; }
      .parameter-default {
        display: inline-block;
        padding: 0.18rem 0.35rem;
        border-radius: 3px;
        background: var(--surface-soft);
        color: var(--muted);
        font-size: 0.78rem;
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
        padding: 0;
        margin: 0;
        border: 0;
      }
      .request-title {
        margin-bottom: 1.75rem;
        font-size: 1.35rem;
      }
      .try-parameters {
        margin-bottom: 1.5rem;
      }
      .try-parameters summary {
        padding: 0 0 1rem;
        color: var(--text);
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer;
      }
      .try-parameters summary:focus { outline: none; }
      .try-parameters summary:focus-visible {
        outline: 1px solid var(--accent);
        outline-offset: 3px;
      }
      .try-parameter-fields {
        display: grid;
        gap: 0.8rem;
        padding: 0 0 1.25rem;
      }
      .try-parameter-fields label {
        display: grid;
        gap: 0.35rem;
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 650;
      }
      .try-parameter-fields input,
      .try-parameter-fields textarea {
        width: 100%;
        padding: 0.6rem 0.65rem;
        border: 1px solid var(--control-border);
        border-radius: 4px;
        background: var(--input-bg);
        color: var(--text);
        font: 0.82rem "Cascadia Code", monospace;
      }
      .try-parameter-fields textarea {
        min-height: 8rem;
        resize: vertical;
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
        border-radius: 6px;
        padding: 0.7rem 0.75rem;
        font-size: 0.94rem;
        box-shadow: none;
      }
      .builder-field textarea {
        min-height: 6rem;
        resize: vertical;
      }
      .builder-field input:focus,
      .builder-field textarea:focus {
        outline: none;
        border-color: var(--control-border-hover);
        box-shadow: 0 0 0 1px rgba(103, 224, 109, 0.28);
      }
      .builder-output {
        margin-top: 1rem;
        padding: 0.85rem 0.95rem;
        border: 1px solid var(--control-border);
        background: var(--input-bg);
        border-radius: 6px;
        color: var(--code);
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-all;
        min-height: 3.2rem;
        font-size: 0.82rem;
      }
      .builder-url-shell {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 2.85rem;
        margin-top: 0.7rem;
        padding: 0.7rem 0.8rem;
        border: 1px solid var(--control-border);
        border-radius: 4px;
        background: var(--input-bg);
      }
      .builder-url-shell code {
        min-width: 0;
        flex: 1;
        overflow-x: auto;
        color: var(--code);
        font-size: 0.82rem;
        white-space: nowrap;
        scrollbar-width: none;
      }
      .builder-url-shell code::-webkit-scrollbar { display: none; }
      .copy-request-button {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 1.8rem;
        height: 1.8rem;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
      }
      .copy-request-button:hover { color: var(--text); }
      .copy-request-button svg {
        width: 1rem;
        height: 1rem;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.5;
      }
      .builder-actions {
        margin-top: 0.85rem;
      }
      .builder-button {
        border: 0;
        background: var(--action);
        color: #071006;
        border-radius: 6px;
        padding: 0.7rem 1rem;
        font-family: inherit;
        font-size: 0.92rem;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: none;
        box-shadow: none;
        cursor: pointer;
        transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, transform 160ms ease;
      }
      .request-rail .builder-button {
        width: 100%;
      }
      .request-rail [data-builder-url] {
        overflow-x: auto;
        white-space: nowrap;
        word-break: normal;
      }
      .builder-button:hover {
        background: #63c969;
        color: #071006;
        transform: none;
      }
      .builder-button:disabled {
        opacity: 0.6;
      }
      .builder-response {
        margin-top: 2.5rem;
        padding-top: 2rem;
      }
      .builder-response h2 {
        margin-bottom: 1rem;
        font-size: 1.35rem;
      }
      .builder-response-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .builder-response-meta [data-builder-status] {
        color: var(--accent-strong);
        font-weight: 700;
      }
      .builder-response .builder-output {
        max-height: calc(100vh - 25rem);
        min-height: 13rem;
        overflow: auto;
        color: var(--green);
      }
      .response-line {
        display: grid;
        grid-template-columns: 2rem minmax(0, 1fr);
        min-width: max-content;
      }
      .response-line-number {
        color: #596168;
        user-select: none;
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
      [data-docs-filter-hidden] { display: none !important; }
      @media (max-width: 1400px) {
        .docs-content-grid.has-request-rail {
          grid-template-columns: minmax(0, 1fr);
        }
        .request-rail {
          position: static;
          height: auto;
          padding: 2rem max(2rem, calc((100% - 820px) / 2)) 3rem;
          border-left: 0;
          border-top: 1px solid var(--line);
        }
        .topbar::after { display: none; }
        .builder-response .builder-output {
          max-height: 28rem;
        }
      }
      @media (max-width: 1080px) {
        .docs-shell {
          grid-template-columns: 1fr;
        }
        .docs-shell.sidebar-collapsed {
          grid-template-columns: 1fr;
        }
        .sidebar {
          position: static;
          height: auto;
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }
        .content-inner {
          width: min(780px, calc(100vw - 2rem));
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
        .request-rail {
          padding: 1.5rem 1rem 2.5rem;
        }
        .endpoint-index-list a {
          grid-template-columns: 3.25rem minmax(0, 1fr);
        }
        .endpoint-index-list a > span:last-child {
          grid-column: 2;
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
  activeHref?: string;
  groups: Array<{
    label: string;
    href: string;
    children?: Array<{ label: string; href: string; method?: string }>;
  }>;
}) {
  return `
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2 class="sidebar-title">${escapeHtml(input.title)}</h2>
        <button class="sidebar-toggle" type="button" aria-label="Collapse sidebar" aria-expanded="true" data-sidebar-toggle>
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m12.5 4.5-5 5 5 5"></path></svg>
        </button>
      </div>
      <p class="sidebar-copy">${escapeHtml(input.copy)}</p>
      <div class="docs-search-wrap">
        <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.25"></circle><path d="m12.5 12.5 4 4"></path></svg>
        <input class="docs-search" type="search" placeholder="Search endpoints…" aria-label="Search endpoints" data-docs-search>
        <kbd>/</kbd>
      </div>
      ${input.groups
        .map(
          (group) => `
            <div class="sidebar-section">
                  ${group.children?.length
                    ? `<span class="nav-section-label">${escapeHtml(group.label)}</span>`
                    : `<a class="nav-link${input.activeHref === group.href ? " active" : ""}" href="${escapeHtml(group.href)}">${escapeHtml(group.label)}</a>`}
              ${
                group.children?.length
                  ? `<ul class="subnav-list">
                      ${group.children
                        .map(
                          (child) => `
                            <li${child.method ? ` class="sidebar-route-${escapeHtml(child.method.toLowerCase())}"` : ""}>
                              <a class="subnav-link${input.activeHref === child.href ? " active" : ""}" href="${escapeHtml(child.href)}">
                                ${child.method ? `<span class="sidebar-method sidebar-method-${escapeHtml(child.method.toLowerCase())}">${escapeHtml(child.method)}</span>` : ""}
                                <span class="sidebar-path">${escapeHtml(child.label)}</span>
                              </a>
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
  const auth = getRouteAuthMetadata(route);
  const autoRequest =
    route.method.toUpperCase() === "GET" &&
    !auth.required &&
    !route.requestBody &&
    !(route.parameters ?? []).some((parameter) => parameter.required);

  return `
    <div class="query-builder">
      <h2 class="request-title">Try it</h2>
      <div
        class="builder-shell"
        data-route-builder
        data-route-path="${escapeHtml(`/api/${version}${route.path}`)}"
        data-route-method="${escapeHtml(route.method)}"
        data-route-origin="__ROUTE_ORIGIN__"
        ${autoRequest ? "data-auto-request" : ""}
      >
        ${
          (route.parameters?.length ?? 0) || route.requestBody
            ? `<details class="try-parameters">
                <summary>Request parameters</summary>
                <div class="try-parameter-fields">
                  ${(route.parameters ?? [])
                    .map(
                      (parameter) => `
                        <label>
                          <span>${escapeHtml(parameter.name)}${parameter.required ? " *" : ""}</span>
                          <input
                            id="${escapeHtml(`${getRouteId(route)}-${parameter.name}`)}"
                            type="text"
                            data-param-name="${escapeHtml(parameter.name)}"
                            data-param-in="${escapeHtml(parameter.in)}"
                            ${parameter.required ? "required" : ""}
                            placeholder="${escapeHtml(parameter.name)}"
                          >
                        </label>`,
                    )
                    .join("")}
                  ${
                    route.requestBody
                      ? `<label>
                          <span>JSON body *</span>
                          <textarea id="${escapeHtml(`${getRouteId(route)}-body`)}" data-param-body="true" placeholder="JSON body" required></textarea>
                        </label>`
                      : ""
                  }
                </div>
              </details>`
            : ""
        }
        <div class="builder-title">Request URL</div>
        <div class="builder-url-shell">
          <code data-builder-url>${escapeHtml(initialUrl)}</code>
          <button type="button" class="copy-request-button" data-copy-request-url aria-label="Copy request URL">
            <svg aria-hidden="true" viewBox="0 0 20 20"><rect x="6.5" y="6.5" width="9" height="9" rx="1.5"></rect><path d="M4.5 13.5h-1v-10h10v1"></path></svg>
          </button>
        </div>
        <div class="builder-actions">
          <button type="button" class="builder-button" data-builder-send>Send request</button>
        </div>
        <div class="builder-response" data-builder-response-wrap>
          <h2>Response</h2>
          <div class="builder-response-meta">
            <span data-builder-status>Ready</span>
            <span>application/json <span aria-hidden="true">⌄</span></span>
          </div>
          <pre class="builder-output response-code" data-builder-response>Send a request to view the response.</pre>
        </div>
      </div>
    </div>`;
}

export function renderVersionDocsPage(input: {
  appName: string;
  version: string;
  tenant: unknown;
  publicOrigin: string;
  routeId?: string;
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
      routes: getBrowsableDocsRoutes().filter(
        (route) =>
          route.tag === tag.name,
      ),
    }))
    .filter((group) => group.routes.length > 0);

  const selectedRoute = input.routeId
    ? getBrowsableDocsRoutes().find((route) => getRouteId(route) === input.routeId)
    : undefined;
  const selectedGroup = selectedRoute
    ? routesByTag.find((group) => group.name === selectedRoute.tag)
    : undefined;
  const overviewHref = `/api/${input.version}`;
  const endpointHref = (route: ApiRegistryRoute) =>
    `/api/${input.version}/docs/${getRouteId(route)}`;

  const sidebarGroups = [
    {
      label: "Overview",
      href: overviewHref,
    },
    ...routesByTag.map((group) => ({
      label: group.name,
      href: endpointHref(group.routes[0]),
      children: group.routes.map((route) => ({
        label: route.path,
        method: route.method,
        href: endpointHref(route),
      })),
    })),
  ];

  const overviewContent = `
    <article class="overview-page">
    <section class="hero" id="overview">
      <h1>${escapeHtml(input.appName)} API Reference</h1>
      <p class="lede">${escapeHtml(String(document.info.description ?? ""))}</p>
    </section>
    <section class="section" id="authentication">
      <h2>Authentication</h2>
      <p>Log in once to send authenticated requests from any endpoint page in this reference.</p>
      <div class="auth-panel">
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
    <section class="section" id="endpoints">
      <h2>Endpoints</h2>
      <p>Browse the public routes available in this API version.</p>
      ${routesByTag
        .map(
          (group) => `
            <div class="endpoint-index-group">
              <h3>${escapeHtml(group.name)}</h3>
              <ul class="endpoint-index-list">
                ${group.routes
                  .map(
                    (route) => `
                      <li>
                        <a href="${escapeHtml(endpointHref(route))}">
                          <span class="sidebar-method sidebar-method-${escapeHtml(route.method.toLowerCase())}">${escapeHtml(route.method)}</span>
                          <code>/api/${escapeHtml(input.version)}${escapeHtml(route.path)}</code>
                          <span>${escapeHtml(route.summary)}</span>
                        </a>
                      </li>`,
                  )
                  .join("")}
              </ul>
            </div>`,
        )
        .join("")}
    </section>
    </article>`;

  const selectedRouteAuth = selectedRoute
    ? getRouteAuthMetadata(selectedRoute)
    : null;

  const endpointContent = selectedRoute
    ? `
      <article class="endpoint-page" id="${escapeHtml(getRouteId(selectedRoute))}">
        <h1>${escapeHtml(selectedRoute.summary)}</h1>
        <div class="route-block">
          <div class="route-head">
            <span class="method method-${escapeHtml(selectedRoute.method.toLowerCase())}">${escapeHtml(selectedRoute.method)}</span>
            ${selectedRoute.deprecated ? `<span class="auth-pill auth-pill-platform">Deprecated</span>` : ""}
            <code class="route-path">/api/${escapeHtml(input.version)}${escapeHtml(selectedRoute.path)}</code>
          </div>
          <div class="route-meta">
            ${selectedRouteAuth?.required || selectedRouteAuth?.optional ? `<span>${escapeHtml(selectedRouteAuth.label)}</span>` : ""}
            ${selectedRoute.requestBody ? "<span>Accepts JSON body</span>" : ""}
            ${selectedRoute.headers ? "<span>Requires headers/service auth context</span>" : ""}
            ${selectedRoute.pagination ? "<span>Cursor pagination</span>" : ""}
            ${selectedRoute.idempotency?.supported ? `<span>Supports ${escapeHtml(selectedRoute.idempotency.header ?? "Idempotency-Key")}</span>` : ""}
            ${selectedRoute.rateLimit?.headers ? "<span>Returns rate-limit headers</span>" : ""}
          </div>
          ${
            (selectedRoute.parameters?.length ?? 0) > 0
              ? `<section class="route-details">
                  <h2>Parameters</h2>
                  ${
                    (selectedRoute.parameters?.length ?? 0) > 0
                      ? `<div class="parameters-scroll"><table class="parameters-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Type</th>
                              <th>Description</th>
                              <th>Required</th>
                              <th>Default</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${(selectedRoute.parameters ?? [])
                              .map(
                                (parameter) => `
                                  <tr>
                                    <td><code>${escapeHtml(parameter.name)}</code></td>
                                    <td>${escapeHtml(String(parameter.schema?.type ?? "string"))}</td>
                                    <td>${escapeHtml(describeDocsParameter(parameter))}</td>
                                    <td>${parameter.required ? "Yes" : "No"}</td>
                                    <td><code class="parameter-default">${escapeHtml(parameter.name)}</code></td>
                                  </tr>`,
                              )
                              .join("")}
                          </tbody>
                        </table></div>`
                      : ""
                  }
                </section>`
              : ""
          }
        </div>
      </article>`
    : overviewContent;

  const body = `
    <div class="docs-shell">
      ${renderSidebar({
        title: `${input.appName} ${input.version}`,
        copy: "",
        activeHref: selectedRoute ? endpointHref(selectedRoute) : overviewHref,
        groups: sidebarGroups,
      })}
      <div class="docs-workspace">
        <div class="topbar endpoint-topbar">
          <div class="topbar-copy">
            ${selectedRoute ? `<span class="topbar-category">${escapeHtml(selectedGroup?.name ?? selectedRoute.tag)}</span><span class="breadcrumb-separator">›</span><code>${escapeHtml(selectedRoute.path)}</code>` : `<span class="topbar-category">Overview</span><span class="breadcrumb-separator">›</span><code>/api/${escapeHtml(input.version)}</code>`}
          </div>
          <div class="topbar-actions">
            <a class="topbar-link" href="/">Back to site</a>
            <a class="topbar-link" href="/api/${escapeHtml(input.version)}/openapi">OpenAPI JSON</a>
          </div>
        </div>
        <div class="docs-content-grid${selectedRoute ? " has-request-rail" : ""}">
          <div class="content">
            <main class="content-inner">
              ${endpointContent}
            </main>
          </div>
          ${selectedRoute ? `<aside class="request-rail">${renderRouteBuilder(selectedRoute, input.version, input.publicOrigin)}</aside>` : ""}
        </div>
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
        return Array.from(document.querySelectorAll("input[data-param-name], textarea[data-param-body]"));
      }

      function getBuilderState(builder) {
        const origin = window.location.origin;
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

      function setResponseText(output, text) {
        output.replaceChildren();
        const allLines = String(text).split("\\n");
        const visibleLines = allLines.slice(0, 120);
        if (allLines.length > visibleLines.length) {
          visibleLines.push("… " + (allLines.length - visibleLines.length) + " more lines");
        }
        for (const [index, line] of visibleLines.entries()) {
          const row = document.createElement("span");
          row.className = "response-line";
          const lineNumber = document.createElement("span");
          lineNumber.className = "response-line-number";
          lineNumber.textContent = String(index + 1);
          const lineText = document.createElement("span");
          lineText.textContent = line || " ";
          row.append(lineNumber, lineText);
          output.append(row);
        }
      }

      async function sendBuilderRequest(builder) {
        const state = getBuilderState(builder);
        const responseOutput = builder.querySelector("[data-builder-response]");
        const responseWrap = builder.querySelector("[data-builder-response-wrap]");
        const responseStatus = builder.querySelector("[data-builder-status]");
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
        responseStatus.textContent = "Sending…";
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

          responseStatus.textContent = response.status + " " + response.statusText;
          setResponseText(responseOutput, pretty || "(empty response)");
        } catch (error) {
          responseStatus.textContent = "Request failed";
          setResponseText(responseOutput, error instanceof Error ? error.message : String(error));
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
        const copyButton = builder.querySelector("[data-copy-request-url]");
        if (copyButton) {
          copyButton.addEventListener("click", async () => {
            const output = builder.querySelector("[data-builder-url]");
            const url = output?.textContent || "";
            await navigator.clipboard.writeText(url);
            copyButton.setAttribute("aria-label", "Copied request URL");
            window.setTimeout(() => copyButton.setAttribute("aria-label", "Copy request URL"), 1500);
          });
        }
        if (builder.hasAttribute("data-auto-request")) {
          void sendBuilderRequest(builder);
        }
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

      const docsShell = document.querySelector(".docs-shell");
      const sidebarToggle = document.querySelector("[data-sidebar-toggle]");
      if (docsShell && sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
          const collapsed = docsShell.classList.toggle("sidebar-collapsed");
          sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
          sidebarToggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
        });
      }

      const docsSearch = document.querySelector("[data-docs-search]");
      if (docsSearch) {
        document.addEventListener("keydown", (event) => {
          if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
              event.preventDefault();
              docsSearch.focus();
            }
          }
        });
        docsSearch.addEventListener("input", () => {
          const query = docsSearch.value.trim().toLowerCase();
          const queryTokens = query.split(/\\s+/).filter(Boolean);

          for (const sidebarSection of document.querySelectorAll(".sidebar-section")) {
            const routeLinks = Array.from(sidebarSection.querySelectorAll(".subnav-link"));
            if (!routeLinks.length) {
              continue;
            }
            let hasMatch = false;
            for (const routeLink of routeLinks) {
              const searchableText = (routeLink.textContent || "").toLowerCase();
              const matches = queryTokens.every((token) => searchableText.includes(token));
              routeLink.parentElement?.toggleAttribute("data-docs-filter-hidden", !matches);
              hasMatch ||= matches;
            }
            sidebarSection.toggleAttribute("data-docs-filter-hidden", queryTokens.length > 0 && !hasMatch);
          }

          for (const indexGroup of document.querySelectorAll(".endpoint-index-group")) {
            const routeLinks = Array.from(indexGroup.querySelectorAll(".endpoint-index-list a"));
            let hasMatch = false;
            for (const routeLink of routeLinks) {
              const searchableText = (routeLink.textContent || "").toLowerCase();
              const matches = queryTokens.every((token) => searchableText.includes(token));
              routeLink.parentElement?.toggleAttribute("data-docs-filter-hidden", !matches);
              hasMatch ||= matches;
            }
            indexGroup.toggleAttribute("data-docs-filter-hidden", queryTokens.length > 0 && !hasMatch);
          }
        });
      }

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
