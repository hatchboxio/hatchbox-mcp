// Checks bearer tokens sent to the remote server against Hatchbox's token introspection
// endpoint (RFC 7662). The server authenticates as a confidential OAuth application created
// in the Hatchbox admin, since only those may introspect.

import { createHash } from "node:crypto";

export interface VerifiedToken {
  token: string;
  /** The OAuth client the token was issued to. Absent for API tokens created in the dashboard. */
  clientId?: string;
  scopes: string[];
  /** Seconds since the epoch. Absent for API tokens, which don't expire. */
  expiresAt?: number;
  /** The Hatchbox user's id. */
  subject?: string;
  /** The resource the token was issued for (RFC 8707), when the client asked for one. */
  audience?: string;
}

export interface TokenVerifier {
  /** The token's details, or null if Hatchbox doesn't consider it active. Throws when
   *  Hatchbox can't be asked, so a Hatchbox outage isn't reported as a bad token. */
  verify(token: string): Promise<VerifiedToken | null>;
}

export interface IntrospectionVerifierConfig {
  introspectionUrl: string;
  clientId: string;
  clientSecret: string;
  /** How long an active result is reused. Revoking a token takes up to this long to reach
   *  this server; the Hatchbox API itself rejects it immediately. */
  cacheTtlMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

const MAX_CACHE_ENTRIES = 10_000;

export class IntrospectionVerifier implements TokenVerifier {
  private readonly config: IntrospectionVerifierConfig;
  private readonly cacheTtlMs: number;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  // Keyed by a hash so tokens aren't kept in memory any longer than a request needs them
  private readonly cache = new Map<string, { result: Omit<VerifiedToken, "token">; until: number }>();

  constructor(config: IntrospectionVerifierConfig) {
    this.config = config;
    this.cacheTtlMs = config.cacheTtlMs ?? 60_000;
    this.fetch = config.fetch ?? globalThis.fetch;
    this.now = config.now ?? Date.now;
  }

  async verify(token: string): Promise<VerifiedToken | null> {
    const key = createHash("sha256").update(token).digest("hex");
    const cached = this.cache.get(key);
    if (cached && cached.until > this.now()) return { token, ...cached.result };

    const result = await this.introspect(token);
    if (!result) {
      this.cache.delete(key);
      return null;
    }

    const expiresAtMs = result.expiresAt === undefined ? Infinity : result.expiresAt * 1000;
    this.remember(key, result, Math.min(this.now() + this.cacheTtlMs, expiresAtMs));
    return { token, ...result };
  }

  private async introspect(token: string): Promise<Omit<VerifiedToken, "token"> | null> {
    // Each part is form encoded before it's joined (RFC 6749 section 2.3.1)
    const credentials = `${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`;
    const response = await this.fetch(this.config.introspectionUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ token }).toString(),
    });

    if (!response.ok) {
      throw new Error(`Token introspection failed with status ${response.status}`);
    }

    const body = (await response.json()) as Record<string, unknown>;
    if (body.active !== true) return null;

    return {
      clientId: typeof body.client_id === "string" ? body.client_id : undefined,
      scopes: typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [],
      expiresAt: typeof body.exp === "number" ? body.exp : undefined,
      subject: typeof body.sub === "string" ? body.sub : undefined,
      audience: typeof body.aud === "string" ? body.aud : undefined,
    };
  }

  private remember(key: string, result: Omit<VerifiedToken, "token">, until: number) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const now = this.now();
      for (const [k, entry] of this.cache) if (entry.until <= now) this.cache.delete(k);
      if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.clear();
    }
    this.cache.set(key, { result, until });
  }
}
