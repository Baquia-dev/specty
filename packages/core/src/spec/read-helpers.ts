// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { type ItemPrefix, parseItemId } from "../ids";
import { normalizePath, pathProblem } from "../paths";
import { type Diagnostic, type DiagnosticInput, diagnostic } from "./diagnostics";
import { type RawField, type RawItem, type RawList, splitList } from "./list";
import type { ItemList, ListSectionKey } from "./model";
import { isNoneMarker, SECTION_TITLES } from "./vocabulary";

/** Result of reading one structured section. `lines` maps item ids (or paths) to lines. */
export interface ListResult<T> {
  readonly list: ItemList<T>;
  readonly diagnostics: readonly Diagnostic[];
  readonly lines: Readonly<Record<string, number>>;
}

/** Collects diagnostics and item lines while a section is read. */
export interface Reader {
  readonly lang: Lang;
  readonly sectionName: string;
  readonly diagnostics: Diagnostic[];
  readonly lines: Record<string, number>;
  report(input: DiagnosticInput): void;
  /** Registers an item id; reports and returns false when it is repeated. */
  claim(key: string, line: number, duplicate: DiagnosticInput): boolean;
}

export const EXAMPLES: Readonly<Record<ListSectionKey, Readonly<Record<Lang, string>>>> = {
  assumptions: { es: "- A1: texto del supuesto", en: "- A1: assumption text" },
  criteria: { es: "- AC1: CUANDO … ENTONCES …", en: "- AC1: WHEN … THEN …" },
  files: { es: "- modificar ruta/al/archivo — motivo", en: "- modify path/to/file — reason" },
  tasks: { es: "- [ ] T1: título de la tarea", en: "- [ ] T1: task title" },
  slices: { es: "- C1: título del corte", en: "- C1: slice title" },
  risks: { es: "- R1: riesgo — mitigación", en: "- R1: risk — mitigation" },
};

export function createReader(lang: Lang, section: ListSectionKey): Reader {
  const diagnostics: Diagnostic[] = [];
  const lines: Record<string, number> = {};
  const report = (input: DiagnosticInput): void => {
    diagnostics.push(diagnostic(lang, input));
  };
  return {
    lang,
    sectionName: SECTION_TITLES[lang][section],
    diagnostics,
    lines,
    report,
    claim(key, line, duplicate) {
      if (lines[key] !== undefined) {
        report(duplicate);
        return false;
      }
      lines[key] = line;
      return true;
    },
  };
}

export function finish<T>(reader: Reader, none: boolean, items: readonly T[]): ListResult<T> {
  return { list: { none, items }, diagnostics: reader.diagnostics, lines: reader.lines };
}

/** Reports layout problems and resolves the explicit "none" marker. */
export function prelude(
  raw: RawList,
  reader: Reader,
): { readonly none: boolean; readonly items: readonly RawItem[] } {
  const section = reader.sectionName;
  const fenced = raw.problems.find((problem) => problem.kind === "fenced");
  if (fenced !== undefined) {
    reader.report({ code: "fence-not-allowed", params: { section }, line: fenced.line });
  }
  for (const problem of raw.problems.filter((entry) => entry.kind !== "fenced")) {
    reader.report({ code: "line-invalid", params: { section }, line: problem.line });
  }
  const markers = raw.items.filter((item) => item.fields.length === 0 && isNoneMarker(item.head));
  if (markers.length === 0) return { none: false, items: raw.items };
  if (raw.items.length === 1) return { none: true, items: [] };
  for (const marker of markers) {
    reader.report({ code: "item-none-mixed", params: { section }, line: marker.line });
  }
  return { none: false, items: raw.items.filter((item) => !markers.includes(item)) };
}

const ID_HEAD = /^([A-Za-z]+\d+)[ \t]*:[ \t]*(.*)$/;

/** Reads `ID: text`, checking the prefix expected by the section. */
export function readIdHead(
  head: string,
  line: number,
  prefix: ItemPrefix,
  example: string,
  reader: Reader,
): { readonly id: string; readonly text: string } | undefined {
  const section = reader.sectionName;
  const match = ID_HEAD.exec(head);
  const parsed = match === null ? undefined : parseItemId(match[1] ?? "");
  const text = (match?.[2] ?? "").trim();
  if (parsed === undefined || text.length === 0) {
    reader.report({ code: "item-invalid", params: { section, example }, line });
    return undefined;
  }
  if (parsed.prefix !== prefix) {
    reader.report({
      code: "item-prefix",
      params: { id: parsed.id, section, prefix },
      line,
      target: parsed.id,
    });
    return undefined;
  }
  return { id: parsed.id, text };
}

/** Reads the `ID: text` head and registers the id, reporting repetitions. */
export function claimedHead(
  head: string,
  line: number,
  prefix: ItemPrefix,
  section: ListSectionKey,
  reader: Reader,
): { readonly id: string; readonly text: string } | undefined {
  const parsed = readIdHead(head, line, prefix, EXAMPLES[section][reader.lang], reader);
  if (parsed === undefined) return undefined;
  const claimed = reader.claim(parsed.id, line, {
    code: "item-duplicate",
    params: { id: parsed.id },
    line,
    target: parsed.id,
  });
  return claimed ? parsed : undefined;
}

/** Indexes the fields of an item by canonical key, reporting unknown and repeated ones. */
export function readFields(
  item: RawItem,
  owner: string,
  canonicalKey: (key: string) => string | undefined,
  valid: readonly string[],
  reader: Reader,
): ReadonlyMap<string, RawField> {
  const fields = new Map<string, RawField>();
  for (const field of item.fields) {
    const key = canonicalKey(field.key);
    if (key === undefined) {
      reader.report({
        code: "field-unknown",
        params: { field: field.key, id: owner, valid: valid.join(", ") },
        line: field.line,
        target: owner,
      });
    } else if (fields.has(key)) {
      reader.report({
        code: "field-duplicate",
        params: { field: field.key, id: owner },
        line: field.line,
        target: owner,
      });
    } else {
      fields.set(key, field);
    }
  }
  return fields;
}

/** Reads `AC1, AC2` style references with the given prefix, without repetitions. */
export function readIdRefs(
  field: RawField,
  owner: string,
  prefix: ItemPrefix,
  reader: Reader,
): string[] {
  const refs = splitList(field.value).flatMap((token) => {
    const parsed = parseItemId(token);
    if (parsed?.prefix === prefix) return [parsed.id];
    reader.report({
      code: "field-invalid",
      params: { id: owner, field: field.key, value: token, valid: `${prefix}1, ${prefix}2…` },
      line: field.line,
      target: owner,
    });
    return [];
  });
  return [...new Set(refs)];
}

/** Normalizes a path, reporting it when it cannot be used. */
export function readPath(
  raw: string,
  line: number,
  owner: string | undefined,
  reader: Reader,
): string | undefined {
  const path = normalizePath(raw);
  const problem = pathProblem(path);
  if (problem === undefined) return path;
  reader.report({
    code: "path-invalid",
    params: { path: raw.trim(), problem },
    line,
    target: owner,
  });
  return undefined;
}
