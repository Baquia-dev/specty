// SPDX-License-Identifier: Apache-2.0
// The export of a change from the History tab (docs/ui.md): its audit report as `specty audit`
// writes it, or its spec as `specty export` does, built here from the change's record with the
// same functions, so it works with any source.
import { auditReport, auditViewOf, type Lang, parseSpec } from "@baquia-dev/specty-core";
import { exportContextOf, exportSpec } from "@baquia-dev/specty-exporters";
import type { ChangeRecord } from "./records";
import { zip } from "./zip";

/** The report in Markdown or JSON, or the spec in OpenSpec, Spec Kit or Kiro. */
export const EXPORTS = ["markdown", "json", "openspec", "speckit", "kiro"] as const;
export type ExportChoice = (typeof EXPORTS)[number];

/** A file to download: its name, its media type and its content. */
export interface Download {
  readonly name: string;
  readonly type: string;
  readonly content: string | Uint8Array<ArrayBuffer>;
}

/** `record` exported as `choice`; the formats of several files come in a zip dated `now`. */
export function exportOf(
  record: ChangeRecord,
  choice: ExportChoice,
  lang: Lang,
  now: Date = new Date(),
): Download {
  const { state } = record;
  const audit = record.audit ?? [];
  const { spec } = parseSpec(record.spec, { language: lang });
  if (choice === "markdown" || choice === "json") {
    const report = auditReport(auditViewOf({ state, spec, audit }), lang);
    return choice === "markdown"
      ? { name: `${state.id}.md`, type: "text/markdown", content: report.markdown }
      : {
          name: `${state.id}.json`,
          type: "application/json",
          content: `${JSON.stringify(report.json, null, 2)}\n`,
        };
  }
  const files = exportSpec(spec, choice, exportContextOf(state, audit));
  return { name: `${state.id}-${choice}.zip`, type: "application/zip", content: zip(files, now) };
}
