// SPDX-License-Identifier: Apache-2.0
// What the person asked for, word for word, as `specty new --request` keeps it. Pure.
import type { AuditRecord } from "./progress";

/** The request in the audit's `change.created`, when the change was created with one. */
export function requestOf(audit: readonly AuditRecord[]): string | undefined {
  const created = audit.find((entry) => entry.event === "change.created");
  const request = created?.data.request;
  return typeof request === "string" && request.trim() !== "" ? request : undefined;
}
