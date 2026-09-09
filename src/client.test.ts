import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HatchboxClient, clientFromEnv } from "./client.js";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe("HatchboxClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("strips a trailing slash from baseUrl", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = new HatchboxClient({ baseUrl: "https://example.com/", token: "t" });
    await client.get("/me");
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.toString()).toBe("https://example.com/me");
  });

  it("sends the bearer token and Accept header, no Content-Type on GET", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "secret" });
    await client.get("/me");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(init.headers.Accept).toBe("application/json");
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("includes query params, skipping undefined values", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "t" });
    await client.get("/apps", { cluster_id: 4, name: undefined });
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get("cluster_id")).toBe("4");
    expect(url.searchParams.has("name")).toBe(false);
  });

  it("sends a JSON body and Content-Type on POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 1 }));
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "t" });
    await client.post("/apps", { app: { name: "foo" } });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ app: { name: "foo" } }));
  });

  it("returns undefined for an empty response body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "t" });
    const result = await client.delete("/apps/1/auto_deploy");
    expect(result).toBeUndefined();
  });

  it("parses and returns a successful JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 4, name: "User One" }));
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "t" });
    const result = await client.get("/me");
    expect(result).toEqual({ id: 4, name: "User One" });
  });

  it("returns parsed data alongside response headers for a paginated request", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 200,
        headers: { "current-page": "1", "total-pages": "3", "total-count": "5", "page-limit": "2" },
      }),
    );
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "t" });
    const result = await client.getPaginated("/apps/1/logs", { limit: 2 });
    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.headers["total-pages"]).toBe("3");
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get("limit")).toBe("2");
  });

  it("throws HatchboxApiError using the singular error field", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "Domain not found" }));
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "t" });
    await expect(client.get("/apps/1/domains/x")).rejects.toMatchObject({
      status: 404,
      message: "Domain not found",
    });
  });

  it("throws HatchboxApiError joining the plural errors array", async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { errors: ["Name is invalid", "Cluster is required"] }));
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "t" });
    await expect(client.post("/apps", {})).rejects.toMatchObject({
      status: 422,
      message: "Name is invalid; Cluster is required",
    });
  });

  it("falls back to a status-based message when the body has no error/errors field", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 401 }));
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "bad" });
    await expect(client.get("/me")).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining("HATCHBOX_API_TOKEN"),
    });
  });

  it("falls back to a generic message for an unmapped status with no error body", async () => {
    fetchMock.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    const client = new HatchboxClient({ baseUrl: "https://example.com", token: "t" });
    await expect(client.get("/me")).rejects.toMatchObject({
      status: 500,
      message: "Request failed with status 500.",
    });
  });
});

describe("clientFromEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.HATCHBOX_BASE_URL;
    delete process.env.HATCHBOX_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to the production API when HATCHBOX_BASE_URL is missing", async () => {
    process.env.HATCHBOX_API_TOKEN = "t";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await clientFromEnv().get("/me");

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.origin + url.pathname).toBe("https://hatchbox.io/api/v1/me");
    vi.unstubAllGlobals();
  });

  // A missing token used to throw here, which killed the process before the transport
  // connected. The MCP client then showed only a generic "failed to connect", and the one
  // message that would have fixed it -- create a token at this URL -- went to the stderr of a
  // process that no longer existed. Forgetting the token is the most common setup mistake, so
  // it has to surface somewhere a person actually reads.
  it("does not throw when HATCHBOX_API_TOKEN is missing, so the server still starts", () => {
    process.env.HATCHBOX_BASE_URL = "https://example.com";
    expect(() => clientFromEnv()).not.toThrow();
  });

  it("reports the missing token on first use, where the caller can relay it", async () => {
    process.env.HATCHBOX_BASE_URL = "https://example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(clientFromEnv().get("/me")).rejects.toThrow(
      /HATCHBOX_API_TOKEN is not set.*hatchbox\.io\/api_tokens/s,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("constructs a client when both are set", () => {
    process.env.HATCHBOX_BASE_URL = "https://example.com";
    process.env.HATCHBOX_API_TOKEN = "t";
    expect(() => clientFromEnv()).not.toThrow();
  });
});
