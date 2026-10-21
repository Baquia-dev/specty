// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "./i18n";

/** `ok` → exit 0, `invalid` (validation errors) → 1, `blocked` by the flow → 2. */
export type OutputStatus = "ok" | "invalid" | "blocked";

export interface OutputBlock {
  readonly title?: string;
  readonly lines: readonly string[];
}

/** What every command prints: a header, blocks and the exact next action. */
export interface Output {
  readonly status: OutputStatus;
  readonly header: string;
  readonly blocks: readonly OutputBlock[];
  readonly next: string;
}

export const EXIT_CODES: Readonly<Record<OutputStatus, 0 | 1 | 2>> = {
  ok: 0,
  invalid: 1,
  blocked: 2,
};

const NEXT_LABEL: Readonly<Record<Lang, string>> = { es: "SIGUIENTE", en: "NEXT" };

/** `SPECTY · <id> · <phase> · <progress>`, skipping missing parts. */
export function headerOf(...parts: readonly (string | undefined)[]): string {
  const present = parts.filter((part): part is string => part !== undefined && part.length > 0);
  return ["SPECTY", ...present].join(" · ");
}

/** A titled block, or nothing when there are no lines. */
export function section(title: string | undefined, lines: readonly string[]): OutputBlock[] {
  if (lines.length === 0) return [];
  return [title === undefined ? { lines } : { title, lines }];
}

export function renderText(output: Output, lang: Lang): string {
  const body = output.blocks.flatMap((block) =>
    block.title === undefined
      ? block.lines
      : [`${block.title}:`, ...block.lines.map((line) => `  ${line}`)],
  );
  return [output.header, ...body, `${NEXT_LABEL[lang]}: ${output.next}`].join("\n");
}
