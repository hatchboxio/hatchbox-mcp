import { describe, expect, it } from "vitest";
import { HatchboxApiError, HatchboxConfigError } from "../client.js";
import { errorResult, jsonResult, runAction, textResult } from "./helpers.js";

describe("jsonResult", () => {
  it("pretty-prints the value as a text content block", () => {
    expect(jsonResult({ id: 1 })).toEqual({
      content: [{ type: "text", text: JSON.stringify({ id: 1 }, null, 2) }],
    });
  });
});

describe("textResult", () => {
  it("wraps plain text without isError", () => {
    expect(textResult("done")).toEqual({ content: [{ type: "text", text: "done" }] });
  });
});

describe("errorResult", () => {
  it("wraps text with isError: true", () => {
    expect(errorResult("failed")).toEqual({ content: [{ type: "text", text: "failed" }], isError: true });
  });
});

describe("runAction", () => {
  it("returns the wrapped function's result on success", async () => {
    const result = await runAction(async () => textResult("ok"));
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
  });

  it("translates a HatchboxApiError into a readable error result", async () => {
    const result = await runAction(async () => {
      throw new HatchboxApiError(404, "Domain not found", { error: "Domain not found" });
    });
    expect(result).toEqual({
      content: [{ type: "text", text: "Hatchbox API error (404): Domain not found" }],
      isError: true,
    });
  });

  it("translates a generic Error into a readable error result", async () => {
    const result = await runAction(async () => {
      throw new Error("boom");
    });
    expect(result).toEqual({ content: [{ type: "text", text: "Unexpected error: boom" }], isError: true });
  });

  // A missing token is a setup step, not a crash. Prefixing it "Unexpected error" reads as a
  // bug in the tool and buries the instruction, which is the whole value of the message.
  it("passes a config error through verbatim, with no crash framing", async () => {
    const result = await runAction(async () => {
      throw new HatchboxConfigError("HATCHBOX_API_TOKEN is not set. Create one at ...");
    });
    expect(result).toEqual({
      content: [{ type: "text", text: "HATCHBOX_API_TOKEN is not set. Create one at ..." }],
      isError: true,
    });
  });

  it("handles a non-Error throw", async () => {
    const result = await runAction(async () => {
      throw "boom";
    });
    expect(result).toEqual({ content: [{ type: "text", text: "Unexpected error: boom" }], isError: true });
  });
});
