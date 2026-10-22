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
import type { Bilingual, DeltaChipView, DeltaEntryView, DeltaView, ReviewSection } from "./records";
import { textAndBefore } from "./word-diff";

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
