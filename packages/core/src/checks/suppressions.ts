// SPDX-License-Identifier: Apache-2.0
import { type CodeLine, splitCode } from "./code";
import type { Mark } from "./markers";

/**
 * Comments and annotations that silence a compiler, a type checker or a linter, by language
 * (ADR 0012): a new one hides a problem instead of fixing it. The catalog follows the
 * documentation of each tool. A marker that is a comment only counts in a comment, and one that
 * is code (an annotation, an attribute, a directive) only in the code, without its strings.
 * TypeScript's own comments belong to `strict-types`, and Dart's to `dart-strict`.
 */

interface Family {
  readonly extensions: readonly string[];
  /** Its comments start with `#`, instead of `//` and `/* *\/`. */
  readonly hash?: boolean;
  /** Rust: a quote that does not close soon starts a lifetime (`splitCode`). */
  readonly lifetimes?: boolean;
  readonly comments?: readonly RegExp[];
  readonly code?: readonly RegExp[];
}

// A tool's directive opens the comment, maybe after the `*` of a doc block or another `#`.
const directive = (body: string, flags = "") =>
  new RegExp(String.raw`(?:^|#)[\s*]*(?<m>${body})(?![\w-])`, flags);
// Some comments count anywhere in a comment.
const anywhere = (body: string) => new RegExp(String.raw`(?<![\w#])(?<m>${body})(?![\w-])`);
const NOSONAR = anywhere("NOSONAR");

const FAMILIES: readonly Family[] = [
  {
    extensions: ["py", "pyi"],
    hash: true,
    comments: [
      directive("noqa", "i"),
      directive(String.raw`(?:ruff|flake8)\s*:\s*noqa`),
      directive(String.raw`ruff\s*:\s*(?:ignore|disable|file-ignore)`),
      directive(String.raw`type\s*:\s*ignore`),
      directive(String.raw`mypy\s*:\s*(?:ignore-errors|disable-error-code)`),
      directive(String.raw`pyright\s*:\s*ignore`),
      directive(String.raw`pylint\s*:\s*(?:disable-next|disable|skip-file)`),
    ],
  },
  {
    extensions: ["rb", "rake", "gemspec"],
    hash: true,
    comments: [directive(String.raw`rubocop\s*:\s*(?:disable|todo)`)],
  },
  {
    extensions: ["ex", "exs"],
    hash: true,
    comments: [directive(String.raw`credo:disable-for-[\w-]+`)],
  },
  {
    extensions: ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"],
    comments: [
      directive("eslint-disable(?:-next-line|-line)?"),
      directive("biome-ignore(?:-all|-start)?"),
    ],
  },
  {
    extensions: ["java"],
    code: [/(?<m>@Suppress(?:FB)?Warnings)\b/],
    comments: [NOSONAR, anywhere("CHECKSTYLE:OFF")],
  },
  {
    extensions: ["kt", "kts"],
    code: [/(?<m>@(?:file:)?Suppress(?:Warnings)?)\b/],
    comments: [NOSONAR],
  },
  {
    extensions: ["cs"],
    code: [
      /(?<m>#\s*pragma\s+warning\s+disable)\b/,
      /(?<m>#\s*nullable\s+disable)\b/,
      /(?<![\w])(?<m>(?:Unconditional)?SuppressMessage)(?:Attribute)?\s*\(/,
    ],
    comments: [directive(String.raw`ReSharper\s+disable`), NOSONAR],
  },
  {
    // golangci-lint and staticcheck read a directive only with no space after the `//`.
    extensions: ["go"],
    comments: [/^(?<m>nolint|lint:(?:ignore|file-ignore))(?![\w-])/, anywhere("#nosec")],
  },
  { extensions: ["rs"], lifetimes: true, code: [/(?<m>#!?\[\s*(?:allow|expect)\s*\()/] },
  {
    extensions: ["php"],
    comments: [
      directive("@phpstan-ignore(?:-next-line|-line)?"),
      directive("phpcs:(?:ignoreFile|ignore|disable)"),
      directive("@psalm-suppress"),
      directive("@SuppressWarnings"),
      NOSONAR,
    ],
  },
  {
    extensions: ["swift"],
    comments: [
      directive("swiftlint:disable(?::(?:next|this|previous))?"),
      directive("swift-format-ignore(?:-file)?"),
    ],
  },
  {
    extensions: ["c", "h", "cc", "cpp", "cxx", "hpp", "hh", "hxx"],
    code: [
      /(?<m>#\s*pragma\s+warning\s*\(\s*disable)/,
      /(?<m>#\s*pragma\s+(?:GCC|clang)\s+diagnostic\s+ignored)/,
    ],
    comments: [anywhere("NOLINT(?:NEXTLINE|BEGIN)?")],
  },
];

/** The suppressions of a source, one per line at most, by the language of its extension. */
export function suppressions(path: string, text: string): Mark[] {
  const extension = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
  const family = FAMILIES.find((candidate) => candidate.extensions.includes(extension));
  if (family === undefined) return [];
  const lines =
    family.hash === true
      ? hashLines(text)
      : splitCode(text, { lifetimes: family.lifetimes === true });
  return lines.flatMap((line, index) => {
    const marker =
      first(family.code ?? [], [line.code]) ?? first(family.comments ?? [], line.comments);
    return marker === undefined ? [] : [{ line: index + 1, marker }];
  });
}

/** The marker that comes first in the first of `texts` with any. */
function first(patterns: readonly RegExp[], texts: readonly string[]): string | undefined {
  for (const text of texts) {
    const matches = patterns
      .map((pattern) => pattern.exec(text))
      .filter((match): match is RegExpExecArray => match !== null);
    const earliest = matches.toSorted((a, b) => a.index - b.index)[0]?.groups?.m;
    if (earliest !== undefined) return earliest.replace(/\s+/g, " ");
  }
  return undefined;
}

/** Lines of a language with `#` comments: the comment starts at the first `#` out of a string. */
function hashLines(text: string): CodeLine[] {
  return text.split(/\r?\n/).map((line) => {
    const at = commentStart(line);
    return at === -1
      ? { code: line, comments: [] }
      : { code: line.slice(0, at), comments: [line.slice(at + 1)] };
  });
}

function commentStart(line: string): number {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (quote === undefined && char === "#") return index;
    if (quote === undefined && (char === '"' || char === "'")) quote = char;
    else if (char === "\\") index += 1;
    else if (char === quote) quote = undefined;
  }
  return -1;
}
