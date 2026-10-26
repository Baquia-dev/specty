// SPDX-License-Identifier: Apache-2.0
import { type ChangeView, parseSpec } from "@baquia-dev/specty-core";
import { isRecord, parseJson, readText } from "../io/files";
import type { Session } from "../session";
import { locateChange, readSpec } from "../store/changes";
import type { ChangeFiles } from "../store/paths";

/** A change's `audit.jsonl`, one entry per line; lines that are not JSON objects are skipped. */
export type Audit = readonly Record<string, unknown>[];

export async function readAudit(files: ChangeFiles): Promise<Audit> {
  return ((await readText(files.audit)) ?? "").split("\n").flatMap((line) => {
    const entry = parseJson(line);
    return isRecord(entry) ? [entry] : [];
  });
}

export function dataOf(entry: Record<string, unknown> | undefined): Record<string, unknown> {
  return isRecord(entry?.data) ? entry.data : {};
}

/** The findings (`task done --finding`) each task recorded, in the order they came. */
export function findingsOf(audit: Audit): { readonly task: string; readonly text: string }[] {
  return audit
    .filter((entry) => entry.event === "task.completed")
    .flatMap((entry) => {
      const { task, findings } = dataOf(entry);
      if (typeof task !== "string" || !Array.isArray(findings)) return [];
      return findings.flatMap((text: unknown) =>
        typeof text === "string" ? [{ task, text }] : [],
      );
    });
}

/**
 * What each change in `follows` left for a new one: the follow-ups of its closing and the
 * findings of its tasks. One that is not in this folder says so.
 */
export async function carriedOf(
  session: Session,
  follows: readonly string[],
): Promise<Pick<ChangeView, "carried">> {
  if (follows.length === 0) return {};
  const carried = await Promise.all(
    follows.map(async (id) => {
      const files = await locateChange(session.paths, id);
      if (files === undefined) return { id, found: false, pending: [], findings: [] };
      const spec = parseSpec(await readSpec(files), { language: session.lang }).spec;
      const findings = findingsOf(await readAudit(files));
      return { id, found: true, pending: followUps(spec.sections.closing), findings };
    }),
  );
  return { carried };
}

const FOLLOW_UPS = new Set(["### pendientes", "### follow-ups", "### follow ups"]);

/** The bullets of the closing's `### Pendientes` (or `### Follow-ups`) subsection. */
function followUps(closing: string | undefined): string[] {
  const lines = (closing ?? "").split("\n");
  const start = lines.findIndex((line) => FOLLOW_UPS.has(line.trim().toLowerCase()));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("#"));
  return (end < 0 ? rest : rest.slice(0, end))
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}
