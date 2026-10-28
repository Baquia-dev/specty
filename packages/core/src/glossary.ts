// SPDX-License-Identifier: Apache-2.0

import type { Lang } from "./i18n";

/**
 * The project's glossary (formats.md §6): one line per term, `- **Term** (`CodeName`): definition.`,
 * which the cards bring just in time, only for the terms their own text uses (ADR 0014).
 */

export interface GlossaryEntry {
  readonly term: string;
  /** How the code names it, when it does. */
  readonly code?: string;
  readonly definition: string;
}

const ENTRY =
  /^\s*[-*]\s+\*\*(?<term>[^*]+?)\*\*(?:\s*\(`(?<code>[^`]+)`\))?\s*:\s*(?<definition>\S.*?)\s*$/;

// Not part of a longer word: letters and digits of any script, and `_` or `$` in names.
const EDGE = String.raw`[\p{L}\p{N}_$]`;

/** Where the glossary lives when `glossary` does not say: by the project's language. */
export function defaultGlossary(lang: Lang): string {
  return lang === "es" ? "docs/dominio.md" : "docs/domain.md";
}

/** The terms a glossary defines, in its order; other lines and HTML comments do not count. */
export function parseGlossary(text: string): GlossaryEntry[] {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const groups = ENTRY.exec(line)?.groups;
      if (groups?.term === undefined || groups.definition === undefined) return [];
      const code = groups.code?.trim();
      return [
        {
          term: groups.term.trim(),
          ...(code === undefined || code === "" ? {} : { code }),
          definition: groups.definition,
        },
      ];
    });
}

/**
 * The entries some of `texts` uses, in the glossary's order: a term in any case, as a whole
 * word and also in plural with `s` or `es`; its name in the code as written.
 */
export function termsIn(
  entries: readonly GlossaryEntry[],
  texts: readonly string[],
): GlossaryEntry[] {
  const text = texts.join("\n");
  return entries.filter(
    (entry) =>
      word(`${escaped(entry.term)}(?:e?s)?`, "iu").test(text) ||
      (entry.code !== undefined && word(escaped(entry.code), "u").test(text)),
  );
}

function word(pattern: string, flags: string): RegExp {
  return new RegExp(`(?<!${EDGE})${pattern}(?!${EDGE})`, flags);
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
