// SPDX-License-Identifier: Apache-2.0
// The closing the agent writes at the end of a change (`## Cierre`), split into the parts the CLI
// asks for. Pure: it runs in the derivation worker.

/** The closing in its parts, each in markdown; a part the agent did not write is empty. */
export interface ClosingParts {
  readonly summary: string;
  readonly deviations: string;
  readonly decisions: string;
  readonly pending: string;
  /** What goes before the first part or under a heading of its own, with that heading. */
  readonly other: string;
}

type Part = Exclude<keyof ClosingParts, "other">;

const PARTS: readonly Part[] = ["summary", "deviations", "decisions", "pending"];

/**
 * The level-3 headings of each part, in Spanish and in English, as `specty next` names them
 * («### Desviaciones (respecto al plan)»): a heading counts by how it begins.
 */
const HEADINGS: Readonly<Record<Part, readonly string[]>> = {
  summary: ["resumen", "summary"],
  deviations: ["desviaciones", "deviations"],
  decisions: ["decisiones", "decisions"],
  pending: ["pendientes", "follow-ups", "follow ups", "pending"],
};

const HEADING = /^###[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

function partOf(heading: string): Part | undefined {
  const name = heading.toLowerCase();
  return PARTS.find((part) => HEADINGS[part].some((start) => name.startsWith(start)));
}

/**
 * The fence open after a line that may open or close one: a fence closes with the same
 * character, at least as long as the one that opened it.
 */
function fenceAfter(fence: string | undefined, opener: string | undefined): string | undefined {
  if (opener === undefined) return fence;
  if (fence === undefined) return opener;
  return opener[0] === fence[0] && opener.length >= fence.length ? undefined : fence;
}

/**
 * Splits a closing by its level-3 headings. A part written twice keeps both; nothing is lost:
 * text before the first heading, or under a heading that is no part, goes to `other`. Headings
 * inside a fenced code block are code, not headings.
 */
export function closingOf(text: string): ClosingParts {
  const found: Record<keyof ClosingParts, string[]> = {
    summary: [],
    deviations: [],
    decisions: [],
    pending: [],
    other: [],
  };
  let current: keyof ClosingParts = "other";
  let fence: string | undefined;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const opener = FENCE.exec(line)?.[1];
    fence = fenceAfter(fence, opener);
    const heading =
      fence === undefined && opener === undefined ? HEADING.exec(line)?.[1] : undefined;
    if (heading === undefined) {
      found[current].push(line);
      continue;
    }
    const part = partOf(heading);
    current = part ?? "other";
    // An unknown heading stays with its text, so `other` still reads as it was written.
    if (part === undefined) found.other.push(line);
  }
  const join = (lines: readonly string[]) => lines.join("\n").trim();
  return {
    summary: join(found.summary),
    deviations: join(found.deviations),
    decisions: join(found.decisions),
    pending: join(found.pending),
    other: join(found.other),
  };
}
