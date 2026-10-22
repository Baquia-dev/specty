// SPDX-License-Identifier: Apache-2.0
// What changed since the approved revision, with core. Like views.ts, only the derivation worker
// loads it.
import {
  DEFAULT_CONFIG,
  type DeltaEntry,
  hashUnits,
  type Impact,
  type Lang,
  type Spec,
  specDelta,
  type Task,
  validateSpec,
} from "@baquia-dev/specty-core";
import type {
  Bilingual,
  DeltaChipView,
  DeltaEntryView,
  DeltaView,
  DiffPart,
  ReviewSection,
} from "./records";

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

/** The prose of each text section, as written (lists keep their dashes). */
const SECTION_TEXT: Readonly<Record<string, (spec: Spec) => string | undefined>> = {
  "section:goal": (spec) => spec.sections.goal,
  "section:reason": (spec) => spec.sections.reason,
  "section:outOfScope": (spec) => spec.sections.outOfScope,
  "section:design": (spec) => spec.sections.design,
};

const IMPACT: Readonly<Record<Impact | "none", Bilingual>> = {
  high: { es: "alto", en: "high" },
  medium: { es: "medio", en: "medium" },
  low: { es: "bajo", en: "low" },
  none: { es: "sin indicar", en: "not set" },
};

/** Words, spaces and punctuation, each its own token: "justificada." keeps "justificada". */
function tokens(text: string): string[] {
  return text.split(/(\s+|[.,;:!?¿¡()«»"“”])/).filter((token) => token.length > 0);
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

/** A word diff: the longest common subsequence of words, spaces and punctuation. */
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
  return merge(tidy(parts));
}

/**
 * Keeps a changed phrase in one piece: a lone space between two changes belongs to them, and
 * within each run of changes what was removed comes before what was added. Without this,
 * "foto o un PDF" against "foto; no…" splits into "o", "un" and "PDF".
 */
function tidy(parts: readonly DiffPart[]): DiffPart[] {
  const changed = (part: DiffPart | undefined) => part?.change !== undefined;
  const spread = parts.flatMap((part, index): DiffPart[] =>
    part.change === undefined &&
    /^\s+$/.test(part.text) &&
    changed(parts[index - 1]) &&
    changed(parts[index + 1])
      ? [
          { text: part.text, change: "removed" },
          { text: part.text, change: "added" },
        ]
      : [part],
  );
  const result: DiffPart[] = [];
  let run: DiffPart[] = [];
  const flush = () => {
    result.push(
      ...run.filter((part) => part.change === "removed"),
      ...run.filter((part) => part.change === "added"),
    );
    run = [];
  };
  for (const part of spread) {
    if (part.change === undefined) {
      flush();
      result.push(part);
    } else {
      run.push(part);
    }
  }
  flush();
  return result;
}

/**
 * A modified text as the person reads it: the final text with the added words marked and, only
 * when words were removed, the approved text with those marked.
 */
export function textAndBefore(
  old: string,
  now: string,
): { readonly text: readonly DiffPart[]; readonly before?: readonly DiffPart[] } {
  const parts = wordDiff(old, now);
  const text = merge(parts.filter((part) => part.change !== "removed"));
  if (!parts.some((part) => part.change === "removed")) return { text };
  return { text, before: merge(parts.filter((part) => part.change !== "added")) };
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

/** The text a unit shows: an item's text, a task's title, a section's prose or a file line. */
function textOf(spec: Spec, entry: DeltaEntry): string {
  const id = entry.key;
  const { sections } = spec;
  switch (entry.kind) {
    case "title":
      return spec.title;
    case "assumption":
      return sections.assumptions?.items.find((item) => item.id === id)?.text ?? "";
    case "criterion":
      return sections.criteria?.items.find((item) => item.id === id)?.text ?? "";
    case "risk":
      return sections.risks?.items.find((item) => item.id === id)?.text ?? "";
    case "task":
      return taskOf(spec, id)?.title ?? "";
    case "section":
      return SECTION_TEXT[id]?.(spec) ?? "";
    default:
      return readable(hashUnits(spec).get(entry.key) ?? "");
  }
}

function taskOf(spec: Spec, id: string): Task | undefined {
  return spec.sections.tasks?.items.find((task) => task.id === id);
}

/** Criteria and files of a task: those added or removed since the approval are marked. */
function chipsOf(
  now: Task | undefined,
  old: Task | undefined,
  modified: boolean,
  scope: readonly Bilingual[],
): readonly DeltaChipView[] {
  const criteria = (task: Task | undefined) => (Array.isArray(task?.ac) ? task.ac : []);
  const isNewScope = (path: string) => scope.some((note) => note.es.includes(path));
  const list = (
    kind: DeltaChipView["kind"],
    current: readonly string[],
    approved: readonly string[],
  ) => [
    ...current.map(
      (label): DeltaChipView => ({
        label,
        kind,
        ...(modified && !approved.includes(label) ? { change: "added" as const } : {}),
        newScope: kind === "file" && isNewScope(label),
      }),
    ),
    ...(modified ? approved.filter((label) => !current.includes(label)) : []).map(
      (label): DeltaChipView => ({ label, kind, change: "removed", newScope: false }),
    ),
  ];
  const shown = now ?? old;
  return [
    ...list("criterion", criteria(shown), modified ? criteria(old) : criteria(shown)),
    ...list("file", shown?.files ?? [], modified ? (old?.files ?? []) : (shown?.files ?? [])),
  ];
}

/** What changed without text of its own: an assumption's impact, a task's verification, type or notes. */
function detailsOf(spec: Spec, approved: Spec, entry: DeltaEntry): readonly Bilingual[] {
  if (entry.change !== "modified") return [];
  if (entry.kind === "assumption") {
    const impact = (from: Spec): Impact | "none" =>
      from.sections.assumptions?.items.find((item) => item.id === entry.key)?.impact ?? "none";
    const old = impact(approved);
    const now = impact(spec);
    if (old === now) return [];
    return [
      {
        es: `Impacto: ${IMPACT[now].es} (antes: ${IMPACT[old].es})`,
        en: `Impact: ${IMPACT[now].en} (was: ${IMPACT[old].en})`,
      },
    ];
  }
  if (entry.kind !== "task") return [];
  const [old, now] = [taskOf(approved, entry.key), taskOf(spec, entry.key)];
  const field = (es: string, en: string, a: string | undefined, b: string | undefined) =>
    a === b
      ? []
      : [
          {
            es: `${es}: ${b ?? "—"} (antes: ${a ?? "—"})`,
            en: `${en}: ${b ?? "—"} (was: ${a ?? "—"})`,
          },
        ];
  return [
    ...field("Verificación", "Verification", old?.verify, now?.verify),
    ...field("Tipo", "Type", old?.type, now?.type),
    ...(old?.notes === now?.notes
      ? []
      : [{ es: "Las notas cambiaron.", en: "The notes changed." }]),
  ];
}

/** Each unit added, removed or modified since `approved`, ready to read. */
export function deriveDelta(spec: Spec, approved: Spec, approvedRevision: number): DeltaView {
  const scope = newScope(spec, approved);
  const entries = specDelta(approved, spec).entries.flatMap((entry): DeltaEntryView[] => {
    const section = sectionOf(entry);
    if (section === undefined || entry.kind === "frontmatter" || entry.kind === "slice") return [];
    const old = textOf(approved, entry);
    const now = textOf(spec, entry);
    const notes = scope.get(entry.key) ?? [];
    const texts =
      entry.change === "modified"
        ? textAndBefore(old, now)
        : { text: [{ text: entry.change === "added" ? now : old }] };
    const chips =
      entry.kind === "task"
        ? chipsOf(
            taskOf(spec, entry.key),
            taskOf(approved, entry.key),
            entry.change === "modified",
            notes,
          )
        : undefined;
    return [
      {
        key: entry.key.replace(/^(file|section):/, ""),
        kind: entry.kind,
        change: entry.change,
        section,
        ...texts,
        ...(chips === undefined ? {} : { chips }),
        details: detailsOf(spec, approved, entry),
        newScope: notes,
      },
    ];
  });
  return { approvedRevision, entries };
}
