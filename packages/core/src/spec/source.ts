// SPDX-License-Identifier: Apache-2.0

/** A body line after HTML comments are removed. `fenced` marks lines of fenced code blocks. */
export interface SourceLine {
  readonly text: string;
  readonly line: number;
  readonly fenced: boolean;
}

export interface SourceHeading {
  readonly text: string;
  readonly line: number;
}

export interface SourceSection {
  readonly heading: SourceHeading;
  readonly body: readonly SourceLine[];
}

export interface SpecSource {
  readonly frontmatter?: { readonly raw: string; readonly line: number };
  readonly frontmatterUnclosed: boolean;
  /** Every `#` heading; the first one is the title. */
  readonly titles: readonly SourceHeading[];
  /** Non-blank lines that appear before the first `##` section. */
  readonly stray: readonly SourceLine[];
  readonly sections: readonly SourceSection[];
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const HEADING = /^ {0,3}(#{1,2})(?=[ \t]|$)(.*)$/;

/** Removes a BOM, converts line endings to LF and Unicode to NFC. */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").normalize("NFC");
}

export function readSource(text: string): SpecSource {
  const lines = normalizeText(text).split("\n");
  const front = readFrontmatterBlock(lines);
  const body = stripComments(lines.slice(front.bodyStart), front.bodyStart + 1);
  return {
    ...(front.frontmatter !== undefined ? { frontmatter: front.frontmatter } : {}),
    frontmatterUnclosed: front.unclosed,
    ...splitSections(body),
  };
}

interface FrontmatterBlock {
  readonly frontmatter?: { readonly raw: string; readonly line: number };
  readonly unclosed: boolean;
  readonly bodyStart: number;
}

function readFrontmatterBlock(lines: readonly string[]): FrontmatterBlock {
  if (lines[0] !== "---") return { unclosed: false, bodyStart: 0 };
  const end = lines.findIndex((line, index) => index > 0 && (line === "---" || line === "..."));
  if (end === -1) return { unclosed: true, bodyStart: 1 };
  return {
    frontmatter: { raw: lines.slice(1, end).join("\n"), line: 2 },
    unclosed: false,
    bodyStart: end + 1,
  };
}

function stripComments(lines: readonly string[], firstLine: number): SourceLine[] {
  const output: SourceLine[] = [];
  let fence: string | undefined;
  let inComment = false;
  lines.forEach((raw, index) => {
    const line = firstLine + index;
    if (fence !== undefined) {
      output.push({ text: raw, line, fenced: true });
      if (closesFence(raw, fence)) fence = undefined;
      return;
    }
    const cleaned = removeComments(raw, inComment);
    inComment = cleaned.open;
    if (cleaned.touched && cleaned.text.trim() === "") return;
    const marker = FENCE_OPEN.exec(cleaned.text)?.[1];
    if (marker !== undefined) fence = marker;
    output.push({ text: cleaned.text, line, fenced: marker !== undefined });
  });
  return output;
}

interface CleanedLine {
  readonly text: string;
  readonly open: boolean;
  readonly touched: boolean;
}

/** Removes `<!-- … -->` spans; `open` reports a comment that continues on the next line. */
function removeComments(raw: string, startsInComment: boolean): CleanedLine {
  let text = "";
  let rest = raw;
  let open = startsInComment;
  let touched = startsInComment;
  while (rest.length > 0) {
    if (open) {
      const end = rest.indexOf("-->");
      if (end === -1) return { text, open: true, touched: true };
      rest = rest.slice(end + 3);
      open = false;
      continue;
    }
    const start = rest.indexOf("<!--");
    if (start === -1) return { text: text + rest, open: false, touched };
    text += rest.slice(0, start);
    rest = rest.slice(start + 4);
    open = true;
    touched = true;
  }
  return { text, open, touched };
}

function closesFence(raw: string, opening: string): boolean {
  const marker = FENCE_CLOSE.exec(raw)?.[1];
  return marker !== undefined && marker[0] === opening[0] && marker.length >= opening.length;
}

interface HeadingMatch {
  readonly level: 1 | 2;
  readonly text: string;
}

function parseHeading(text: string): HeadingMatch | undefined {
  const match = HEADING.exec(text);
  if (match === null) return undefined;
  const content = (match[2] ?? "")
    .trim()
    .replace(/(?:^|\s+)#+$/, "")
    .trim();
  return { level: match[1] === "#" ? 1 : 2, text: content };
}

function splitSections(lines: readonly SourceLine[]): Omit<SpecSource, "frontmatterUnclosed"> {
  const titles: SourceHeading[] = [];
  const stray: SourceLine[] = [];
  const sections: { heading: SourceHeading; body: SourceLine[] }[] = [];
  for (const line of lines) {
    const heading = line.fenced ? undefined : parseHeading(line.text);
    if (heading?.level === 1) {
      titles.push({ text: heading.text, line: line.line });
      continue;
    }
    if (heading?.level === 2) {
      sections.push({ heading: { text: heading.text, line: line.line }, body: [] });
      continue;
    }
    const current = sections.at(-1);
    if (current !== undefined) current.body.push(line);
    else if (line.text.trim() !== "") stray.push(line);
  }
  return { titles, stray, sections };
}
