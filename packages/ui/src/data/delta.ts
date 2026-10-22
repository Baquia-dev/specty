// SPDX-License-Identifier: Apache-2.0
// What changed since the approved revision, with core. Like views.ts, only the derivation worker
// loads it.
import {
  DEFAULT_CONFIG,
  type DeltaEntry,
  hashUnits,
  type Lang,
  type Spec,
  specDelta,
  validateSpec,
} from "@baquia-dev/specty-core";
import type { Bilingual, DeltaEntryView, DeltaView, DiffPart, ReviewSection } from "./records";

/** Past this many tokens per side, a modified text shows whole, removed and then added. */
const MAX_TOKENS = 600;

const SECTION_BY_KIND: Readonly<Partial<Record<DeltaEntry["kind"], ReviewSection>>> = {
  assumption: "assumptions",
  criterion: "criteria",
  task: "tasks",
  risk: "risks",
  file: "files",
};

/** Sections of text. The item lists are covered item by item, so their own unit is left out. */
const TEXT_SECTIONS: Readonly<Record<string, ReviewSection>> = {
  "section:goal": "goal",
  "section:reason": "goal",
  "section:outOfScope": "outOfScope",
  "section:design": "design",
};

/** Words and the spaces between them, so a diff keeps the original spacing. */
function tokens(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

/** Joins neighbouring parts with the same change. */
function merge(parts: readonly DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (last !== undefined && last.change === part.change) {
      merged[merged.length - 1] = { ...last, text: last.text + part.text };
    } else if (part.text.length > 0) {
      merged.push(part);
    }
  }
  return merged;
}

/** A word diff: the longest common subsequence of words and spaces. */
export function wordDiff(before: string, after: string): readonly DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return merge([
      { text: before, change: "removed" },
      { text: after, change: "added" },
    ]);
  }
  const width = b.length + 1;
  // common[i * width + j]: length of the common subsequence of a[i..] and b[j..].
  const common = new Uint32Array((a.length + 1) * width);
  const at = (i: number, j: number) => common[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i * width + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      parts.push({ text: a[i] ?? "" });
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      parts.push({ text: a[i++] ?? "", change: "removed" });
    } else {
      parts.push({ text: b[j++] ?? "", change: "added" });
    }
  }
  for (; i < a.length; i++) parts.push({ text: a[i] ?? "", change: "removed" });
  for (; j < b.length; j++) parts.push({ text: b[j] ?? "", change: "added" });
  return merge(parts);
}

/** A unit's text as the person reads it: without the list marker, the checkbox or the id. */
export function readable(text: string): string {
  return text
    .split("\n")
    .map((line, index) =>
      index === 0 ? line.replace(/^- (\[[ x]\] )?([A-Z]+\d+: )?/, "") : line.replace(/^\s+- /, ""),
    )
    .join("\n");
}

/** Core's "possible new scope" rule, as it runs on `propose` after an adjustment, in both languages. */
function newScope(spec: Spec, approved: Spec): ReadonlyMap<string, readonly Bilingual[]> {
  const run = (language: Lang) =>
    validateSpec(
      { ...spec, language },
      { phase: "adjusting", config: DEFAULT_CONFIG, approved, doneTasks: new Set() },
    ).filter((found) => found.code === "possible-new-scope");
  const en = run("en");
  const notes = new Map<string, Bilingual[]>();
  run("es").forEach((found, index) => {
    if (found.target === undefined) return;
    const text = { es: found.message, en: en[index]?.message ?? found.message };
    notes.set(found.target, [...(notes.get(found.target) ?? []), text]);
  });
  return notes;
}

function sectionOf(entry: DeltaEntry): ReviewSection | "title" | undefined {
  if (entry.kind === "title") return "title";
  if (entry.kind === "section") return TEXT_SECTIONS[entry.key];
  return SECTION_BY_KIND[entry.kind];
}

/** Each unit added, removed or modified since `approved`, with its word diff. */
export function deriveDelta(spec: Spec, approved: Spec, approvedRevision: number): DeltaView {
  const before = hashUnits(approved);
  const after = hashUnits(spec);
  const scope = newScope(spec, approved);
  const entries = specDelta(approved, spec).entries.flatMap((entry): DeltaEntryView[] => {
    const section = sectionOf(entry);
    if (section === undefined || entry.kind === "frontmatter" || entry.kind === "slice") return [];
    const old = readable(before.get(entry.key) ?? "");
    const now = readable(after.get(entry.key) ?? "");
    const diff =
      entry.change === "added"
        ? [{ text: now, change: "added" as const }]
        : entry.change === "removed"
          ? [{ text: old, change: "removed" as const }]
          : wordDiff(old, now);
    return [
      {
        key: entry.key.replace(/^(file|section):/, ""),
        kind: entry.kind,
        change: entry.change,
        section,
        diff,
        newScope: scope.get(entry.key) ?? [],
      },
    ];
  });
  return { approvedRevision, entries };
}
