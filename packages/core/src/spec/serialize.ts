// SPDX-License-Identifier: Apache-2.0
import { stringify } from "yaml";
import type { Lang } from "../i18n";
import {
  type Assumption,
  type FileEntry,
  type Frontmatter,
  type ItemList,
  SECTION_ORDER,
  type SectionKey,
  type Slice,
  type Spec,
  type Task,
} from "./model";
import {
  FILE_ACTION_WORDS,
  IMPACT_KEY,
  IMPACT_WORDS,
  NONE_WORD,
  SECTION_TITLES,
} from "./vocabulary";

/** Writes the canonical form of a spec. `serializeSpec(parseSpec(x).spec)` is idempotent. */
export function serializeSpec(spec: Spec): string {
  const lang = spec.language;
  const sections = SECTION_ORDER.flatMap((key) => {
    const body = sectionBody(spec, key, lang);
    if (body === undefined) return [];
    const heading = `## ${SECTION_TITLES[lang][key]}`;
    return [body.length > 0 ? `${heading}\n\n${body}` : heading];
  });
  const title = `# ${spec.title}`.trimEnd();
  return `${[serializeFrontmatter(spec.frontmatter), title, ...sections].join("\n\n")}\n`;
}

/**
 * Text of every hashable unit of a spec: frontmatter, title, each section and each item.
 * Task checkboxes are left out because task status lives in `state.json`.
 */
export function hashUnits(spec: Spec): ReadonlyMap<string, string> {
  const lang = spec.language;
  const { sections } = spec;
  const pairs = <T>(
    list: ItemList<T> | undefined,
    key: (item: T) => string,
    text: (item: T) => string,
  ) => (list?.items ?? []).map((item): readonly [string, string] => [key(item), text(item)]);
  return new Map<string, string>([
    ["frontmatter", serializeFrontmatter(spec.frontmatter)],
    ["title", spec.title],
    ...SECTION_ORDER.flatMap((key): (readonly [string, string])[] => {
      const unit = sectionUnit(spec, key);
      return unit === undefined ? [] : [[`section:${key}`, unit]];
    }),
    ...pairs(
      sections.assumptions,
      (item) => item.id,
      (item) => assumptionLines(item, lang).join("\n"),
    ),
    ...pairs(
      sections.criteria,
      (item) => item.id,
      (item) => idLine(item.id, item.text),
    ),
    ...pairs(
      sections.tasks,
      (item) => item.id,
      (item) => taskLines({ ...item, done: false }).join("\n"),
    ),
    ...pairs(
      sections.slices,
      (item) => item.id,
      (item) => sliceLines(item).join("\n"),
    ),
    ...pairs(
      sections.risks,
      (item) => item.id,
      (item) => idLine(item.id, item.text),
    ),
    ...pairs(
      sections.files,
      (item) => `file:${item.path}`,
      (item) => fileLine(item, lang),
    ),
  ]);
}

export function serializeFrontmatter(frontmatter: Frontmatter): string {
  const data = {
    kind: frontmatter.kind,
    ...(frontmatter.epic !== undefined ? { epic: frontmatter.epic } : {}),
    ...(frontmatter.slice !== undefined ? { slice: frontmatter.slice } : {}),
    ...(frontmatter.follows.length > 0 ? { follows: [...frontmatter.follows] } : {}),
    ...(frontmatter.dependsOn.length > 0 ? { dependsOn: [...frontmatter.dependsOn] } : {}),
    ...(frontmatter.allowedDependencies !== undefined && frontmatter.allowedDependencies.length > 0
      ? { allowedDependencies: [...frontmatter.allowedDependencies] }
      : {}),
    ...(frontmatter.timebox !== undefined ? { timebox: frontmatter.timebox } : {}),
    ...(frontmatter.estimate !== undefined
      ? { estimate: { adjust: frontmatter.estimate.adjust, reason: frontmatter.estimate.reason } }
      : {}),
    ...(frontmatter.effort !== undefined
      ? { effort: { review: frontmatter.effort.review, reason: frontmatter.effort.reason } }
      : {}),
  };
  return `---\n${stringify(data, { lineWidth: 0 }).trimEnd()}\n---`;
}

function sectionBody(spec: Spec, key: SectionKey, lang: Lang): string | undefined {
  const { sections } = spec;
  switch (key) {
    case "goal":
    case "question":
    case "reason":
    case "outOfScope":
    case "design":
    case "closing":
      return sections[key];
    case "assumptions":
      return listBody(sections.assumptions, lang, (item) => assumptionLines(item, lang));
    case "criteria":
      return listBody(sections.criteria, lang, (item) => [idLine(item.id, item.text)]);
    case "files":
      return listBody(sections.files, lang, (item) => [fileLine(item, lang)]);
    case "tasks":
      return listBody(sections.tasks, lang, taskLines);
    case "slices":
      return listBody(sections.slices, lang, sliceLines);
    case "risks":
      return listBody(sections.risks, lang, (item) => [idLine(item.id, item.text)]);
  }
}

function sectionUnit(spec: Spec, key: SectionKey): string | undefined {
  const value = spec.sections[key];
  if (value === undefined || typeof value === "string") return value;
  return value.none ? "none" : "list";
}

function listBody<T>(
  list: ItemList<T> | undefined,
  lang: Lang,
  render: (item: T) => readonly string[],
): string | undefined {
  if (list === undefined) return undefined;
  if (list.none) return `- ${NONE_WORD[lang]}`;
  return list.items.flatMap(render).join("\n");
}

function idLine(id: string, text: string): string {
  return `- ${id}: ${text}`;
}

function assumptionLines(item: Assumption, lang: Lang): string[] {
  const impact =
    item.impact === undefined
      ? []
      : [`  - ${IMPACT_KEY[lang]}: ${IMPACT_WORDS[lang][item.impact]}`];
  return [idLine(item.id, item.text), ...impact];
}

function taskLines(task: Task): string[] {
  const field = (key: string, value: string | undefined): string[] =>
    value === undefined ? [] : [`  - ${key}: ${value}`];
  const ac = task.ac === undefined ? undefined : task.ac === "none" ? "—" : task.ac.join(", ");
  return [
    `- [${task.done ? "x" : " "}] ${task.id}: ${task.title}`,
    ...field("files", task.files.length > 0 ? task.files.map(pathToken).join(", ") : undefined),
    ...field("ac", ac),
    ...field("verify", task.verify),
    ...field("type", task.type),
    ...field("notes", task.notes),
    ...field(
      "effort",
      task.effort === undefined
        ? undefined
        : `${task.effort.level}${task.effort.reason === undefined ? "" : ` — ${task.effort.reason}`}`,
    ),
  ];
}

function sliceLines(slice: Slice): string[] {
  return [
    idLine(slice.id, slice.title),
    ...(slice.ac.length > 0 ? [`  - ac: ${slice.ac.join(", ")}`] : []),
    ...(slice.depends.length > 0 ? [`  - depends: ${slice.depends.join(", ")}`] : []),
  ];
}

/** One `- action path — reason` line of the Files section. */
export function fileLine(entry: FileEntry, lang: Lang): string {
  const source =
    entry.action === "rename" && entry.from !== undefined ? `${pathToken(entry.from)} -> ` : "";
  const reason = entry.reason === undefined ? "" : ` — ${entry.reason}`;
  return `- ${FILE_ACTION_WORDS[lang][entry.action]} ${source}${pathToken(entry.path)}${reason}`;
}

/** Wraps paths that would otherwise be misread (spaces, commas, dashes) in backticks. */
function pathToken(path: string): string {
  return /[\s,`—–]/.test(path) || path.startsWith("-") ? `\`${path}\`` : path;
}
