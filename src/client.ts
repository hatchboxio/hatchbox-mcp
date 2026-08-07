// Thin HTTP client for the Hatchbox /api/v1 API.
//
// Every v1 endpoint speaks JSON, auths via `Authorization: Bearer <token>`,
// and reports errors as either `{ error: string }` or `{ errors: string[] }`
// (validation failures use the plural form). This wraps that into one
// typed error class so tool handlers don't each re-implement parsing.

export class HatchboxApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "HatchboxApiError";
  }
}

export interface HatchboxClientConfig {
  baseUrl: string;
  token: string;
}

export class HatchboxClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: HatchboxClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
  }

  async get(path: string, query?: Record<string, string | number | undefined>) {
    return this.request("GET", path, { query });
  }

  async post(path: string, body?: unknown) {
    return this.request("POST", path, { body });
  }

  async patch(path: string, body?: unknown) {
    return this.request("PATCH", path, { body });
  }

  async delete(path: string, body?: unknown) {
    return this.request("DELETE", path, { body });
  }

  private async request(
    method: string,
    path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    // 204/empty-body success responses (e.g. domain delete, env var update).
    const text = await response.text();
    const parsed = text.length > 0 ? safeJsonParse(text) : undefined;

    if (!response.ok) {
      throw new HatchboxApiError(response.status, describeError(response.status, parsed), parsed);
    }

    return parsed;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describeError(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    if ("error" in body && typeof (body as any).error === "string") {
      return (body as any).error;
    }
    if ("errors" in body && Array.isArray((body as any).errors)) {
      return (body as any).errors.join("; ");
    }
  }

  switch (status) {
    case 401:
      return "Unauthorized — the configured HATCHBOX_API_TOKEN is missing or invalid.";
    case 404:
      return "Not found.";
    case 429:
      return "Rate limited by Hatchbox — retry in about a minute.";
    default:
      return `Request failed with status ${status}.`;
  }
}

export function clientFromEnv(): HatchboxClient {
  const baseUrl = process.env.HATCHBOX_BASE_URL;
  const token = process.env.HATCHBOX_API_TOKEN;

  if (!baseUrl) {
    throw new Error("HATCHBOX_BASE_URL is not set. Point it at the Hatchbox API, e.g. https://hatchbox.io/api/v1");
  }
  if (!token) {
    throw new Error(
      "HATCHBOX_API_TOKEN is not set. Create one at https://hatchbox.io/api_tokens and set it in the MCP server config.",
    );
  }

  return new HatchboxClient({ baseUrl, token });
}
