// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { translator } from "./text";

// What `propose` says of the files outside the spec that import what it changes.

/** The importers a line names by default (`internal.cards.importersShown`); the rest it counts. */
export const IMPORTERS_SHOWN = 5;

export function impactTitle(lang: Lang): string {
  return translator(lang)("LO USAN FUERA DE LA SPEC", "USED OUTSIDE THE SPEC");
}

/** A file the spec changes, with the first `count` of the files outside it that import it. */
export function impactLine(
  path: string,
  importers: readonly string[],
  lang: Lang,
  count = IMPORTERS_SHOWN,
): string {
  const shown = importers.slice(0, count).join(", ");
  const more = importers.length - count;
  return translator(lang)(
    `${path} — importado por ${shown}${more > 0 ? ` y ${more} más` : ""}`,
    `${path} — imported by ${shown}${more > 0 ? ` and ${more} more` : ""}`,
  );
}
