// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";
import { translator } from "./text";

// The remarks of the last independent review of a change's result (ADR 0011) that its closing
// does not cite: the closing card shows them, and closing the change leaves them in Specty's
// memory as pending items (ADR 0016), so what the review found is not forgotten.

type Severity = "high" | "medium" | "low";

/** A remark of high or medium severity of a reviewer's answer. */
export interface ReviewRemark {
  /** `<file>#<n>`: `n` is its place among all the first-level bullets of the answer, from 1. */
  readonly ref: string;
  readonly severity: "high" | "medium";
  /** The bullet's text, as the reviewer wrote it. */
  readonly text: string;
}

/** A first-level bullet: `-`, `*`, `•` or a number, and its text. */
const BULLET = /^(?:[-*•]|\d+[.)])\s+(.+)$/;
const HEADING = /^#{1,6}\s/;
/** A severity, as a whole word, in Spanish or in English. */
const SEVERITY =
  /(?<![\p{L}\p{N}])(alta|cr[ií]tica|high|critical|media|medium|baja|low)(?![\p{L}\p{N}])/iu;
const SEVERITIES: Readonly<Record<string, Severity>> = {
  alta: "high",
  crítica: "high",
  critica: "high",
  high: "high",
  critical: "high",
  media: "medium",
  medium: "medium",
  baja: "low",
  low: "low",
};

/**
 * The remarks of high or medium severity of a reviewer's answer kept in `file`. A remark's
 * severity is the first severity word of its bullet or, if it has none, that of the last
 * markdown heading above it; the low ones and those without a severity are left out.
 */
export function reviewRemarks(file: string, markdown: string): ReviewRemark[] {
  const remarks: ReviewRemark[] = [];
  let heading: Severity | undefined;
  let number = 0;
  for (const line of markdown.replaceAll("\r\n", "\n").split("\n")) {
    if (HEADING.test(line)) {
      heading = severityOf(line);
      continue;
    }
    const text = BULLET.exec(line)?.[1]?.trim();
    if (text === undefined) continue;
    number += 1;
    const severity = severityOf(text) ?? heading;
    if (severity === "high" || severity === "medium")
      remarks.push({ ref: `${file}#${number}`, severity, text });
  }
  return remarks;
}

function severityOf(text: string): Severity | undefined {
  const word = SEVERITY.exec(text)?.[1];
  return word === undefined ? undefined : SEVERITIES[word.toLowerCase()];
}

/** The remarks whose reference `closing` does not contain; `diff-2.md#30` does not cite `#3`. */
export function uncitedRemarks(
  remarks: readonly ReviewRemark[],
  closing: string | undefined,
): ReviewRemark[] {
  return remarks.filter((remark) => !cites(closing ?? "", remark.ref));
}

function cites(text: string, ref: string): boolean {
  for (let at = text.indexOf(ref); at >= 0; at = text.indexOf(ref, at + 1))
    if (!/\d/.test(text.charAt(at + ref.length))) return true;
  return false;
}

/** The text of the pending item a remark leaves; `dir` is where its answer is kept. */
export function reviewRemarkText(remark: ReviewRemark, dir: string, lang: Lang): string {
  const where = `\`${dir}/${remark.ref}\``;
  return translator(lang)(
    `Observación de la revisión independiente que el cierre no citó (${where}): ${remark.text}`,
    `Remark of the independent review that the closing did not cite (${where}): ${remark.text}`,
  );
}

/** The lines of the closing card about the remarks it does not cite yet; none, no lines. */
export function reviewRemarkLines(remarks: readonly ReviewRemark[], lang: Lang): string[] {
  if (remarks.length === 0) return [];
  const t = translator(lang);
  return [
    ...remarks.map((remark) => `${remark.ref} · ${remark.text}`),
    t(
      "Cita en el cierre, con el motivo, la referencia de las que corregiste o que no son un problema real; las que no cites pasan a la memoria como pendientes al cerrar.",
      "Cite in the closing, with the reason, the reference of those you fixed or that are not a real problem; those you do not cite become pending items in the memory on close.",
    ),
  ];
}
