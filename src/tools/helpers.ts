import { HatchboxApiError } from "../client.js";

/** Annotations for tools that only read data (safe HTTP methods). */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

/** Annotations for tools that create/update/delete data (unsafe HTTP methods). */
export const WRITE = { destructiveHint: true, openWorldHint: true } as const;

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
