import { describe, expect, it, vi } from "vitest";
import { IntrospectionVerifier } from "./auth.js";

function introspectionResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function build(fetchMock: ReturnType<typeof vi.fn>, now = () => 1_000_000_000_000) {
  return new IntrospectionVerifier({
    introspectionUrl: "https://hatchbox.example/oauth/introspect",
    clientId: "mcp client",
    clientSecret: "s3cret:",
    fetch: fetchMock as unknown as typeof fetch,
    now,
  });
}

describe("IntrospectionVerifier", () => {
  it("posts the token with the client's credentials", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => introspectionResponse({ active: false }));
    await build(fetchMock).verify("tok en");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hatchbox.example/oauth/introspect");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("token=tok+en");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    // Form encoded before joining (RFC 6749 section 2.3.1)
    expect(Buffer.from(init.headers.Authorization.replace("Basic ", ""), "base64").toString()).toBe("mcp%20client:s3cret%3A");
  });

  it("returns the details of an active token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      introspectionResponse({ active: true, client_id: "abc", scope: "apps:read apps:write", exp: 1_000_000_600, sub: "user_1", aud: "https://mcp.example/mcp" }),
    );
    expect(await build(fetchMock).verify("good")).toEqual({
      token: "good",
      clientId: "abc",
      scopes: ["apps:read", "apps:write"],
      expiresAt: 1_000_000_600,
      subject: "user_1",
      audience: "https://mcp.example/mcp",
    });
  });

  it("returns null for an inactive token, and asks again next time", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => introspectionResponse({ active: false }));
    const verifier = build(fetchMock);
    expect(await verifier.verify("bad")).toBeNull();
    expect(await verifier.verify("bad")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses an active result for a minute", async () => {
    let now = 1_000_000_000_000;
    const fetchMock = vi.fn().mockImplementation(async () => introspectionResponse({ active: true, sub: "user_1" }));
    const verifier = build(fetchMock, () => now);

    await verifier.verify("good");
    now += 59_000;
    await verifier.verify("good");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 2_000;
    await verifier.verify("good");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops reusing a result when the token expires", async () => {
    let now = 1_000_000_000_000;
    const fetchMock = vi.fn().mockImplementation(async () => introspectionResponse({ active: true, exp: 1_000_000_010 }));
    const verifier = build(fetchMock, () => now);

    await verifier.verify("short");
    now += 11_000;
    await verifier.verify("short");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when Hatchbox can't answer, rather than calling the token invalid", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => introspectionResponse({ error: "invalid_client" }, 401));
    await expect(build(fetchMock).verify("good")).rejects.toThrow("status 401");
  });
});
