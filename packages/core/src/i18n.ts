// SPDX-License-Identifier: Apache-2.0

/** Languages for spec headings, keywords and messages. */
export type Lang = "es" | "en";

export const LANGS: readonly Lang[] = ["es", "en"];

/** Lowercases, removes diacritics and collapses whitespace so keywords match tolerantly. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Formats a count with the singular or plural noun. */
export function counted(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
