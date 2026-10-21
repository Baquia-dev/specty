// SPDX-License-Identifier: Apache-2.0
import type { DiagnosticCode } from "./diagnostics";

export type MessageParams = Readonly<Record<string, string | number>>;

export type MessageCatalog = Readonly<Record<DiagnosticCode, (params: MessageParams) => string>>;

/** Reads a message parameter as text; missing parameters render as an empty string. */
export function param(params: MessageParams, key: string): string {
  return String(params[key] ?? "");
}
