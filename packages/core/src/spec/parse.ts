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
  const diagnostics: Diagnostic[] = [...front.diagnostics, ...layoutDiagnostics(source, lang)];
  const sections: MutableSections = {};
  const sectionLines: Partial<Record<SectionKey, number>> = {};
  const itemLines: Record<string, number> = {};
  const fileLines: Record<string, number> = {};

  for (const { section, match } of matched) {
    const line = section.heading.line;
    if (match === undefined) {
      const valid = Object.values(SECTION_TITLES[lang]).join(", ");
      diagnostics.push(
        diagnostic(lang, {
          code: "section-unknown",
          params: { heading: section.heading.text, valid },
          line,
        }),
      );
      continue;
    }
    const { key } = match;
    if (sectionLines[key] !== undefined) {
      diagnostics.push(
        diagnostic(lang, {
          code: "section-duplicate",
          params: { section: SECTION_TITLES[lang][key] },
          line,
          target: `section:${key}`,
        }),
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

  const title = source.titles[0];
  return {
    spec: { language: lang, frontmatter: front.frontmatter, title: title?.text ?? "", sections },
    locations: {
      ...(source.frontmatter !== undefined ? { frontmatter: source.frontmatter.line } : {}),
      ...(title !== undefined ? { title: title.line } : {}),
      sections: sectionLines,
      items: itemLines,
      files: fileLines,
    },
    diagnostics,
  };
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
  const unclosed = source.frontmatterUnclosed
    ? [diagnostic(lang, { code: "frontmatter-unclosed", line: 1 })]
    : [];
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
