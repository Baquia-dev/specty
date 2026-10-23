// SPDX-License-Identifier: Apache-2.0
// Syntax highlighting for the diff viewer (docs/ui.md, Visor de diffs). Shiki and each grammar
// load with `import()` when a diff first shows: only types come from Shiki here.
import { InjectionToken } from "@angular/core";
import type { HighlighterCore, ThemedToken } from "shiki/core";
import type { DiffFile, DiffLine } from "../data/diff";
import { languageOf } from "./languages";

/** A piece of a line: its text, whether it is a word that changed, and its highlighting. */
export interface LineSpan {
  readonly text: string;
  readonly changed: boolean;
  /** A design token, as `var(--color-code-keyword)`; none for plain text. */
  readonly color?: string;
  readonly italic?: boolean;
}

/** A highlighted piece of code, in the order of its line. */
export interface CodeToken {
  readonly text: string;
  readonly color?: string;
  readonly italic?: boolean;
}

/** The highlighted pieces of each line of a file. */
export type FileColors = ReadonlyMap<DiffLine, readonly CodeToken[]>;

/** Highlights a file; none when its language is not highlighted or highlighting failed. */
export type Highlight = (file: DiffFile) => Promise<FileColors | undefined>;

/**
 * A line in pieces: wherever its color or its changed words begin or end. Tokens that do not
 * spell the line exactly are left out: the line shows plain.
 */
export function spansOf(line: DiffLine, tokens?: readonly CodeToken[]): readonly LineSpan[] {
  const ranges = line.changed ?? [];
  const fits = tokens !== undefined && tokens.map((token) => token.text).join("") === line.text;
  const pieces: readonly CodeToken[] = fits ? tokens : [{ text: line.text }];
  const spans: LineSpan[] = [];
  let at = 0;
  for (const { text, color, italic } of pieces) {
    const end = at + text.length;
    const inside = ranges.flatMap(({ start, end: stop }) => [start, stop]);
    const cuts = [at, ...inside.filter((cut) => cut > at && cut < end), end].toSorted(
      (a, b) => a - b,
    );
    for (let k = 0; k + 1 < cuts.length; k++) {
      const [from, to] = [cuts[k] ?? 0, cuts[k + 1] ?? 0];
      if (from === to) continue;
      spans.push({
        text: line.text.slice(from, to),
        changed: ranges.some(({ start, end: stop }) => start <= from && to <= stop),
        ...(color === undefined ? {} : { color }),
        ...(italic ? { italic } : {}),
      });
    }
    at = end;
  }
  return spans.length > 0 ? spans : [{ text: line.text, changed: false }];
}

/** Past this many lines, a file shows plain: highlighting it would hold the page. */
export const MAX_HIGHLIGHTED_LINES = 2000;

const THEME = "specty";

/** Shiki's CSS-variables theme, read as the system's code colors; the rest is plain text. */
const COLORS: Readonly<Record<string, string>> = {
  "var(--code-token-keyword)": "var(--color-code-keyword)",
  "var(--code-token-string)": "var(--color-code-string)",
  "var(--code-token-string-expression)": "var(--color-code-string)",
  "var(--code-token-link)": "var(--color-code-string)",
  "var(--code-token-comment)": "var(--color-code-comment)",
  "var(--code-token-function)": "var(--color-code-function)",
  "var(--code-token-constant)": "var(--color-code-constant)",
};

/** Shiki's bit for italics. */
const ITALIC = 1;

function tokenOf({ content, color, fontStyle }: ThemedToken): CodeToken {
  const ours = color === undefined ? undefined : COLORS[color];
  // Comments always go in italics, whatever the grammar says.
  const italic = ((fontStyle ?? 0) & ITALIC) !== 0 || ours === "var(--color-code-comment)";
  return {
    text: content,
    ...(ours === undefined ? {} : { color: ours }),
    ...(italic ? { italic } : {}),
  };
}

let shiki: Promise<HighlighterCore> | undefined;

/** One highlighter for the page, with no grammar until a file needs it; retried if it failed. */
function highlighter(): Promise<HighlighterCore> {
  shiki ??= (async () => {
    const [{ createCssVariablesTheme, createHighlighterCore }, { createJavaScriptRegexEngine }] =
      await Promise.all([import("shiki/core"), import("shiki/engine/javascript")]);
    const theme = createCssVariablesTheme({
      name: THEME,
      variablePrefix: "--code-",
      fontStyle: true,
    });
    return createHighlighterCore({
      themes: [theme],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  })().catch((error: unknown) => {
    shiki = undefined;
    throw error;
  });
  return shiki;
}

/**
 * Highlights each side of each hunk as one piece of code, so the grammar follows the code: the
 * old side (context and removed lines) and the new one (context and added lines). Context lines
 * take the new side's colors.
 */
export async function highlightFile(file: DiffFile): Promise<FileColors | undefined> {
  const language = languageOf(file.path);
  const total = file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
  if (language === undefined || file.binary || total === 0 || total > MAX_HIGHLIGHTED_LINES) {
    return undefined;
  }
  try {
    const shikiCore = await highlighter();
    if (!shikiCore.getLoadedLanguages().includes(language.id)) {
      await shikiCore.loadLanguage(language.load);
    }
    const colors = new Map<DiffLine, readonly CodeToken[]>();
    for (const hunk of file.hunks) {
      for (const skipped of ["added", "removed"] as const) {
        const side = hunk.lines.filter((line) => line.kind !== skipped);
        const code = side.map((line) => line.text).join("\n");
        const { tokens } = shikiCore.codeToTokens(code, { lang: language.id, theme: THEME });
        side.forEach((line, index) => {
          // The old side gives only the removed lines; the new one, the rest.
          if (skipped === "removed" || line.kind === "removed") {
            colors.set(line, (tokens[index] ?? []).map(tokenOf));
          }
        });
      }
    }
    return colors;
  } catch {
    // A grammar that would not load, or Shiki itself: the diff shows plain.
    return undefined;
  }
}

/** How the diff viewer highlights: Shiki by default; tests and other hosts can swap it. */
export const HIGHLIGHT = new InjectionToken<Highlight>("HIGHLIGHT", {
  providedIn: "root",
  factory: () => highlightFile,
});
