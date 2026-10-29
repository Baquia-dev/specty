// SPDX-License-Identifier: Apache-2.0
import { isRecord } from "../io/files";

/**
 * JSON-RPC 2.0, one message per line, as the stdio transport of MCP speaks it: what `specty mcp`
 * reads and writes, and how it agrees on the protocol's version.
 */

/** The versions of MCP the server knows, oldest first. */
const PROTOCOL_VERSIONS: readonly string[] = [
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

type Id = string | number | null;

/** A line once read: a request, which gets an answer; a notification, which does not; or neither. */
export type Incoming =
  | {
      readonly kind: "request";
      readonly id: string | number;
      readonly method: string;
      readonly params: Readonly<Record<string, unknown>>;
    }
  | { readonly kind: "notification" }
  | { readonly kind: "invalid"; readonly id: Id; readonly code: number; readonly message: string };

export function parseMessage(line: string): Incoming {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { kind: "invalid", id: null, code: PARSE_ERROR, message: "Parse error" };
  }
  if (!isRecord(value) || typeof value.method !== "string") {
    return { kind: "invalid", id: idOf(value), code: INVALID_REQUEST, message: "Invalid request" };
  }
  if (!("id" in value)) return { kind: "notification" };
  const id = idOf(value);
  if (id === null) {
    return { kind: "invalid", id: null, code: INVALID_REQUEST, message: "Invalid request id" };
  }
  return {
    kind: "request",
    id,
    method: value.method,
    params: isRecord(value.params) ? value.params : {},
  };
}

function idOf(value: unknown): Id {
  const id = isRecord(value) ? value.id : undefined;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

export function result(id: Id, value: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result: value });
}

export function failure(id: Id, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

/**
 * The answer to `initialize`: the client's version if the server knows it, or its latest one.
 * With `apps`, the client renders MCP Apps and the view exists: the server also has resources.
 */
export function initialized(
  params: Readonly<Record<string, unknown>>,
  version: string,
  apps = false,
): Record<string, unknown> {
  const asked = params.protocolVersion;
  return {
    protocolVersion:
      typeof asked === "string" && PROTOCOL_VERSIONS.includes(asked)
        ? asked
        : PROTOCOL_VERSIONS[PROTOCOL_VERSIONS.length - 1],
    capabilities: { tools: { listChanged: false }, ...(apps ? { resources: {} } : {}) },
    serverInfo: { name: "specty", version },
    instructions:
      "Specty enforces spec-driven development. Call specty_next first and follow its NEXT line (SIGUIENTE in Spanish). Pass `folder` with the change's folder when you work in a worktree. The person's decisions (approve, accept, close) are not tools.",
  };
}
