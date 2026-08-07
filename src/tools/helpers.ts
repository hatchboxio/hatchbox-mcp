import { HatchboxApiError } from "../client.js";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function errorResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * Checks that the given keys are present (not undefined) on args, returning a
 * ready-to-return error result naming the action and the missing fields if not.
 * Needed because per-action required fields can't be expressed in the flat
 * object schema the SDK requires (see README/memory: z.discriminatedUnion as a
 * tool's top-level inputSchema silently degrades to an empty JSON Schema in
 * @modelcontextprotocol/sdk 1.30 — every field here has to be `.optional()`).
 */
export function missingFields(args: Record<string, unknown>, keys: string[], action: string): ToolResult | null {
  const missing = keys.filter((k) => args[k] === undefined || args[k] === null);
  if (missing.length === 0) return null;
  return errorResult(`action=${action} requires: ${missing.join(", ")}`);
}

/** Runs a tool action, translating HatchboxApiError into an MCP tool error instead of throwing. */
export async function runAction(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HatchboxApiError) {
      return errorResult(`Hatchbox API error (${err.status}): ${err.message}`);
    }
    return errorResult(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
