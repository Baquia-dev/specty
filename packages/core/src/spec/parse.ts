// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { type Diagnostic, diagnostic } from "./diagnostics";
import { readFrontmatter } from "./frontmatter";
import { readList } from "./list";
import {
  isProseSection,
  type ListSectionKey,
  type SectionKey,
  type Spec,
  type SpecLocations,
  type SpecSections,
} from "./model";
import { readFiles } from "./read-files";
import type { ListResult } from "./read-helpers";
import { readAssumptions, readCriteria, readRisks, readSlices } from "./read-items";
import { readTasks } from "./read-tasks";
import { readSource, type SourceLine, type SpecSource } from "./source";
import { SECTION_TITLES, sectionFromHeading } from "./vocabulary";

export interface ParseOptions {
  /** Language assumed when the headings do not reveal one. */
  readonly language?: Lang;
}

export interface ParseResult {
  readonly spec: Spec;
  readonly locations: SpecLocations;
  readonly diagnostics: readonly Diagnostic[];
}

type MutableSections = { -readonly [K in SectionKey]?: NonNullable<SpecSections[K]> };

/**
 * Parses a spec leniently: it always returns a spec (best effort) plus diagnostics.
 * Accepted variations (case, accents, `*` bullets, backticked paths…) are normalized.
 */
export function parseSpec(text: string, options: ParseOptions = {}): ParseResult {
  const source = readSource(text);
  const matched = source.sections.map((section) => ({
    section,
    match: sectionFromHeading(section.heading.text),
  }));
  const lang = detectLanguage(
    matched.flatMap(({ match }) => (match === undefined ? [] : [match.lang])),
    options.language,
  );
  const front = readFrontmatter(source.frontmatter?.raw, source.frontmatter?.line, lang);
  const read = readSections(matched, lang);
  const title = source.titles[0];
  return {
    spec: {
      language: lang,
      frontmatter: front.frontmatter,
      title: title?.text ?? "",
      sections: read.sections,
    },
    locations: {
      ...(source.frontmatter !== undefined ? { frontmatter: source.frontmatter.line } : {}),
      ...(title !== undefined ? { title: title.line } : {}),
      sections: read.sectionLines,
      items: read.itemLines,
      files: read.fileLines,
    },
    diagnostics: [...front.diagnostics, ...layoutDiagnostics(source, lang), ...read.diagnostics],
  };
}

/** A section of the source with the section its heading names, if it names one. */
interface MatchedSection {
  readonly section: SpecSource["sections"][number];
  readonly match: ReturnType<typeof sectionFromHeading>;
}

interface ReadSections {
  readonly sections: MutableSections;
  readonly sectionLines: Partial<Record<SectionKey, number>>;
  readonly itemLines: Record<string, number>;
  readonly fileLines: Record<string, number>;
  readonly diagnostics: readonly Diagnostic[];
}

/** Each section in its place, with its lines; an unknown or repeated heading is reported and skipped. */
function readSections(matched: readonly MatchedSection[], lang: Lang): ReadSections {
  const sections: MutableSections = {};
  const sectionLines: Partial<Record<SectionKey, number>> = {};
  const itemLines: Record<string, number> = {};
  const fileLines: Record<string, number> = {};
  const diagnostics: Diagnostic[] = [];
  for (const { section, match } of matched) {
    const line = section.heading.line;
    if (match === undefined) {
      const valid = Object.values(SECTION_TITLES[lang]).join(", ");
      const params = { heading: section.heading.text, valid };
      diagnostics.push(diagnostic(lang, { code: "section-unknown", params, line }));
      continue;
    }
    const { key } = match;
    if (sectionLines[key] !== undefined) {
      const params = { section: SECTION_TITLES[lang][key] };
      diagnostics.push(
        diagnostic(lang, { code: "section-duplicate", params, line, target: `section:${key}` }),
      );
      continue;
    }
    sectionLines[key] = line;
    if (isProseSection(key)) {
      sections[key] = proseText(section.body);
      continue;
    }
    const result = readListSection(key, section.body, lang, sections);
    diagnostics.push(...result.diagnostics);
    Object.assign(key === "files" ? fileLines : itemLines, result.lines);
  }
  return { sections, sectionLines, itemLines, fileLines, diagnostics };
}

type AnyListResult = Pick<ListResult<unknown>, "diagnostics" | "lines">;

function readListSection(
  key: ListSectionKey,
  body: readonly SourceLine[],
  lang: Lang,
  sections: MutableSections,
): AnyListResult {
  const raw = readList(body);
  switch (key) {
    case "assumptions": {
      const result = readAssumptions(raw, lang);
      sections.assumptions = result.list;
      return result;
    }
    case "criteria": {
      const result = readCriteria(raw, lang);
      sections.criteria = result.list;
      return result;
    }
    case "files": {
      const result = readFiles(raw, lang);
      sections.files = result.list;
      return result;
    }
    case "tasks": {
      const result = readTasks(raw, lang);
      sections.tasks = result.list;
      return result;
    }
    case "slices": {
      const result = readSlices(raw, lang);
      sections.slices = result.list;
      return result;
    }
    case "risks": {
      const result = readRisks(raw, lang);
      sections.risks = result.list;
      return result;
    }
  }
}

/** Prose is kept as written, minus trailing spaces and surrounding blank lines. */
function proseText(body: readonly SourceLine[]): string {
  return body
    .map((line) => line.text.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

function detectLanguage(langs: readonly Lang[], fallback: Lang | undefined): Lang {
  const spanish = langs.filter((lang) => lang === "es").length;
  const english = langs.length - spanish;
  if (spanish !== english) return spanish > english ? "es" : "en";
  return langs[0] ?? fallback ?? "en";
}

function layoutDiagnostics(source: SpecSource, lang: Lang): Diagnostic[] {
  const unclosed = [
    ...(source.frontmatterUnclosed
      ? [diagnostic(lang, { code: "frontmatter-unclosed", line: 1 })]
      : []),
    ...(source.commentUnclosed !== undefined
      ? [diagnostic(lang, { code: "comment-unclosed", line: source.commentUnclosed })]
      : []),
  ];
  const [title, extra] = source.titles;
  const missingTitle = title === undefined ? [diagnostic(lang, { code: "title-missing" })] : [];
  const duplicateTitle =
    extra === undefined ? [] : [diagnostic(lang, { code: "title-duplicate", line: extra.line })];
  const firstStray = source.stray[0];
  const stray =
    firstStray === undefined
      ? []
      : [diagnostic(lang, { code: "text-outside-section", line: firstStray.line })];
  return [...unclosed, ...missingTitle, ...duplicateTitle, ...stray];
}
