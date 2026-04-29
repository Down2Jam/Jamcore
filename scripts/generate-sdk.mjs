import fs from "node:fs/promises";
import path from "node:path";

const registryPath = path.resolve(process.cwd(), "contracts", "api-registry.json");
const outputPath = path.resolve(process.cwd(), "generated", "sdk.ts");

const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));

function buildRoutePath(route) {
  const inferredParams = [...route.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const pathParams = route.pathParams ?? inferredParams;
  if (pathParams.length === 0) {
    return `"${route.path}"`;
  }

  let template = route.path;
  for (const param of pathParams) {
    template = template.replace(`{${param}}`, `\${${param}}`);
  }
  return `\`${template}\``;
}

function buildMethod(route) {
  const inferredParams = [...route.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const pathParams = route.pathParams ?? inferredParams;
  const args = [];
  if (pathParams.length > 0) {
    args.push(...pathParams.map((param) => `${param}: string`));
  }
  if (route.method === "GET" && route.parameters?.some((parameter) => parameter.in === "query")) {
    args.push(`query: RequestOptions["query"] = undefined`);
  }
  if (route.requestBody) {
    args.push("body: unknown");
  }
  if (route.headers) {
    args.push("headers?: Record<string, string>");
  }

  const options = [];
  if (route.method === "GET" && route.parameters?.some((parameter) => parameter.in === "query")) {
    options.push("query");
  }
  if (route.requestBody) {
    options.push("body");
  }
  if (route.headers) {
    options.push("headers");
  }

  return `    ${route.sdkName}: (${args.join(", ")}) => request("${route.method}", ${buildRoutePath(route)}, { ${options.join(", ")} }),`;
}

const methods = registry.routes.map(buildMethod).join("\n");

const source = `export type JamcoreClientConfig = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
};

type RequestOptions = {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

function withQuery(url: string, query?: RequestOptions["query"]) {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? \`\${url}?\${queryString}\` : url;
}

export function createJamcoreClient(config: JamcoreClientConfig = {}) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl ?? "";

  async function request(method: string, route: string, options: RequestOptions = {}) {
    const response = await fetchImpl(withQuery(\`\${baseUrl}/api/v1\${route}\`, options.query), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(config.headers ?? {}),
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
      throw new Error(\`Jamcore request failed: \${response.status}\`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  return {
${methods}
  };
}
`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, source, "utf8");
