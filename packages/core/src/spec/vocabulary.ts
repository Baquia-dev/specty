// SPDX-License-Identifier: Apache-2.0
import { fold, LANGS, type Lang } from "../i18n";
import { lookup } from "../lookup";
import {
  type ChangeKind,
  COMMIT_TYPES,
  type CommitType,
  type FileAction,
  type Impact,
  type SectionKey,
} from "./model";

export const SECTION_TITLES: Readonly<Record<Lang, Readonly<Record<SectionKey, string>>>> = {
  es: {
    goal: "Objetivo",
    question: "Pregunta",
    reason: "Motivo",
    outOfScope: "Fuera de alcance",
    assumptions: "Supuestos",
    criteria: "Criterios de aceptación",
    design: "Diseño",
    files: "Archivos",
    tasks: "Tareas",
    slices: "Cortes",
    risks: "Riesgos",
    closing: "Cierre",
  },
  en: {
    goal: "Goal",
    question: "Question",
    reason: "Reason",
    outOfScope: "Out of scope",
    assumptions: "Assumptions",
    criteria: "Acceptance criteria",
    design: "Design",
    files: "Files",
    tasks: "Tasks",
    slices: "Slices",
    risks: "Risks",
    closing: "Closing",
  },
};

export interface SectionMatch {
  readonly key: SectionKey;
  readonly lang: Lang;
}

const SECTION_ALIASES: ReadonlyMap<string, SectionMatch> = new Map([
  ...LANGS.flatMap((lang) =>
    Object.entries(SECTION_TITLES[lang]).flatMap(([key, title]) =>
      isSectionKey(key) ? [[fold(title), { key, lang }] as const] : [],
    ),
  ),
  ["criterios", { key: "criteria", lang: "es" }],
  ["criteria", { key: "criteria", lang: "en" }],
]);

/** Maps a `##` heading to its section, tolerating case, accents and a trailing colon. */
export function sectionFromHeading(heading: string): SectionMatch | undefined {
  return SECTION_ALIASES.get(fold(heading.replace(/[:.]\s*$/, "")));
}

export interface KindRules {
  readonly required: readonly SectionKey[];
  readonly optional: readonly SectionKey[];
  /** Whether the Closing section is required when the change is being closed. */
  readonly closingRequired: boolean;
}

export const KIND_RULES: Readonly<Record<ChangeKind, KindRules>> = {
  quick: { required: ["goal", "files", "tasks"], optional: [], closingRequired: false },
  standard: {
    required: ["goal", "outOfScope", "assumptions", "criteria", "files", "tasks"],
    optional: ["design", "risks"],
    closingRequired: true,
  },
  spike: {
    required: ["question", "outOfScope", "assumptions", "files", "tasks"],
    optional: [],
    closingRequired: true,
  },
  retro: { required: ["goal", "reason", "files", "risks"], optional: [], closingRequired: false },
  epic: {
    required: ["goal", "outOfScope", "assumptions", "criteria", "slices"],
    optional: ["design", "risks"],
    closingRequired: true,
  },
};

const FILE_ACTION_ALIASES: Readonly<Record<string, FileAction>> = {
  crear: "create",
  anadir: "create",
  create: "create",
  add: "create",
  modificar: "modify",
  editar: "modify",
  actualizar: "modify",
  modify: "modify",
  edit: "modify",
  update: "modify",
  borrar: "delete",
  eliminar: "delete",
  delete: "delete",
  remove: "delete",
  renombrar: "rename",
  mover: "rename",
  rename: "rename",
  move: "rename",
};

export const FILE_ACTION_WORDS: Readonly<Record<Lang, Readonly<Record<FileAction, string>>>> = {
  es: { create: "crear", modify: "modificar", delete: "borrar", rename: "renombrar" },
  en: { create: "create", modify: "modify", delete: "delete", rename: "rename" },
};

export function fileActionFrom(word: string): FileAction | undefined {
  return lookup(FILE_ACTION_ALIASES, fold(word));
}

const IMPACT_ALIASES: Readonly<Record<string, Impact>> = {
  alto: "high",
  alta: "high",
  high: "high",
  medio: "medium",
  media: "medium",
  medium: "medium",
  bajo: "low",
  baja: "low",
  low: "low",
};

export const IMPACT_KEY: Readonly<Record<Lang, string>> = { es: "impacto", en: "impact" };

export const IMPACT_WORDS: Readonly<Record<Lang, Readonly<Record<Impact, string>>>> = {
  es: { high: "alto", medium: "medio", low: "bajo" },
  en: { high: "high", medium: "medium", low: "low" },
};

export function impactFrom(word: string): Impact | undefined {
  return lookup(IMPACT_ALIASES, fold(word));
}

export function isImpactKey(key: string): boolean {
  return Object.values(IMPACT_KEY).includes(fold(key));
}

const NONE_MARKERS: ReadonlySet<string> = new Set([
  "ninguno",
  "ninguna",
  "none",
  "n/a",
  "na",
  "—",
  "–",
  "-",
]);

export const NONE_WORD: Readonly<Record<Lang, string>> = { es: "Ninguno", en: "None" };

export function isNoneMarker(text: string): boolean {
  return NONE_MARKERS.has(fold(text));
}

export function commitTypeFrom(word: string): CommitType | undefined {
  const folded = fold(word);
  return COMMIT_TYPES.find((type) => type === folded);
}

/** Task types that may declare `ac: —` because they do not implement a criterion. */
export const TYPES_WITHOUT_CRITERIA: ReadonlySet<CommitType> = new Set([
  "refactor",
  "test",
  "docs",
  "chore",
]);

export const TASK_FIELDS: readonly string[] = ["files", "ac", "verify", "type", "notes", "effort"];
export const SLICE_FIELDS: readonly string[] = ["ac", "depends"];

function isSectionKey(key: string): key is SectionKey {
  return Object.hasOwn(SECTION_TITLES.en, key);
}
