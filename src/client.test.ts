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

  it("throws when HATCHBOX_BASE_URL is missing", () => {
    process.env.HATCHBOX_API_TOKEN = "t";
    expect(() => clientFromEnv()).toThrow(/HATCHBOX_BASE_URL/);
  });

  it("throws when HATCHBOX_API_TOKEN is missing", () => {
    process.env.HATCHBOX_BASE_URL = "https://example.com";
    expect(() => clientFromEnv()).toThrow(/HATCHBOX_API_TOKEN/);
  });

  it("constructs a client when both are set", () => {
    process.env.HATCHBOX_BASE_URL = "https://example.com";
    process.env.HATCHBOX_API_TOKEN = "t";
    expect(() => clientFromEnv()).not.toThrow();
  });
});
