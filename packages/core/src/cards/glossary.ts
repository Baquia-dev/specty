// SPDX-License-Identifier: Apache-2.0
import { type GlossaryEntry, termsIn } from "../glossary";
import type { Lang } from "../i18n";
import { type OutputBlock, section } from "../output";
import { translator } from "./text";
import type { ChangeView } from "./view";

// The domain terms just in time (ADR 0014): only those a card's own text uses.

/** The terms a card brings and the longest line of each: what the largest card has room for. */
const MAX_TERMS = 3;
const MAX_LINE = 100;

/** The definitions of the first terms of the glossary that `texts` use, or nothing. */
export function termsSection(
  glossary: ChangeView["glossary"],
  texts: readonly (string | undefined)[],
  lang: Lang,
): OutputBlock[] {
  const used = termsIn(
    glossary?.entries ?? [],
    texts.filter((text) => text !== undefined),
  );
  const t = translator(lang);
  return section(t("TÉRMINOS DEL DOMINIO", "DOMAIN TERMS"), used.slice(0, MAX_TERMS).map(line));
}

/** The closing keeps the glossary up to date with the terms the change brought or renamed. */
export function glossaryClosingLines(glossary: ChangeView["glossary"], lang: Lang): string[] {
  if (glossary === undefined) return [];
  const t = translator(lang);
  return [
    t(
      `Si el cambio introdujo o renombró términos del dominio, añádelos o corrígelos en ${glossary.path}, una línea por término como las que ya tiene.`,
      `If the change introduced or renamed domain terms, add or fix them in ${glossary.path}, one line per term like the ones it has.`,
    ),
  ];
}

function line(entry: GlossaryEntry): string {
  const text = `${entry.term}${entry.code === undefined ? "" : ` (${entry.code})`}: ${entry.definition}`;
  return text.length <= MAX_LINE ? text : `${text.slice(0, MAX_LINE - 1).trimEnd()}…`;
}
