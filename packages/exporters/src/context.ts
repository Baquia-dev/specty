// SPDX-License-Identifier: Apache-2.0
import type { ChangeState } from "@baquia-dev/specty-core";
import type { ExportContext } from "./parts";

/**
 * What an export tells of the change, from its state and the lines of its `audit.jsonl`
 * (formats.md §4): its id, its branch, the day it was created and the user's request. The CLI
 * and the UI's export give the same.
 */
export function exportContextOf(state: ChangeState, audit: readonly unknown[]): ExportContext {
  const created = audit.find(
    (entry): entry is Readonly<Record<string, unknown>> =>
      isRecord(entry) && entry.event === "change.created",
  );
  const request = isRecord(created?.data) ? created.data.request : undefined;
  return {
    id: state.id,
    ...(state.branch === undefined ? {} : { branch: state.branch }),
    ...(typeof created?.ts === "string" ? { created: created.ts.slice(0, 10) } : {}),
    ...(typeof request === "string" ? { request } : {}),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
