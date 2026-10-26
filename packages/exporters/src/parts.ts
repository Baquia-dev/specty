// SPDX-License-Identifier: Apache-2.0
import type { FileEntry, Spec } from "@baquia-dev/specty-core";

/** What an export needs besides the spec: the change and what its state and audit know. */
export interface ExportContext {
  /** The change's id, such as `20261024-saludo-personalizado`. */
  readonly id: string;
  readonly branch?: string;
  /** `YYYY-MM-DD`, when the change was created. */
  readonly created?: string;
  /** The user's literal request (`new --request`). */
  readonly request?: string;
}

/** A file of an export: its path in the format's own layout, and its content. */
export interface ExportedFile {
  readonly path: string;
  readonly content: string;
}

/** The change's name without its date: the capability, feature or folder of a format. */
export function featureOf(id: string): string {
  return id.replace(/^\d{8}-/, "");
}

const VERBS: Readonly<Record<FileEntry["action"], string>> = {
  create: "Add",
  modify: "Modify",
  delete: "Remove",
  rename: "Rename",
};

/** `- Modify \`src/app.ts\`: saludo`, one per file of the spec. */
export function fileLines(spec: Spec): string[] {
  return (spec.sections.files?.items ?? []).map((entry) => {
    const path =
      entry.from === undefined ? `\`${entry.path}\`` : `\`${entry.from}\` → \`${entry.path}\``;
    return `- ${VERBS[entry.action]} ${path}${entry.reason === undefined ? "" : `: ${entry.reason}`}`;
  });
}

/** `- A1: …`, with `(high impact)` on the assumptions that would change the design. */
export function assumptionLines(spec: Spec): string[] {
  return (spec.sections.assumptions?.items ?? []).map(
    (item) => `- ${item.id}: ${item.text}${item.impact === "high" ? " (high impact)" : ""}`,
  );
}

export function riskLines(spec: Spec): string[] {
  return (spec.sections.risks?.items ?? []).map((item) => `- ${item.id}: ${item.text}`);
}

/** A Markdown section, or nothing when it has no lines. */
export function block(heading: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [heading, "", ...lines, ""];
}

/** A section's text as lines, or none when the section is missing or empty. */
export function textLines(text: string | undefined): string[] {
  return text === undefined || text.trim() === "" ? [] : [text.trim()];
}
