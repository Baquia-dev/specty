// SPDX-License-Identifier: Apache-2.0
// A word diff that reads well: punctuation apart, spaces never deciding, and each changed phrase
// in one piece. Pure, so it also runs in the derivation worker.
import type { DiffPart } from "./records";

/** Past this many tokens per side, a modified text shows whole, removed and then added. */
const MAX_TOKENS = 600;

/** Words, spaces and punctuation, each its own token: "justificada." keeps "justificada". */
function tokens(text: string): string[] {
  return text.split(/(\s+|[.,;:!?¿¡()«»"“”])/).filter((token) => token.length > 0);
}

/** Code: every sign is a token of its own, so `a=b` against `a=c` changes only `b`. */
export function codeTokens(text: string): string[] {
  return text.split(/(\s+|[^\p{L}\p{N}_$])/u).filter((token) => token.length > 0);
}

/** Only words and punctuation score a match: spaces are everywhere and must not decide it. */
function weight(token: string): number {
  return /^\s+$/.test(token) ? 0 : 1;
}

/** Joins neighbouring parts with the same change. */
function merge(parts: readonly DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (last !== undefined && last.change === part.change) {
      merged[merged.length - 1] = { ...last, text: last.text + part.text };
    } else if (part.text.length > 0) {
      merged.push(part);
    }
  }
  return merged;
}

/**
 * A word diff: the heaviest common subsequence of words and punctuation. `split` cuts the texts
 * into tokens: prose by default, or `codeTokens`.
 */
export function wordDiff(
  before: string,
  after: string,
  split: (text: string) => string[] = tokens,
): readonly DiffPart[] {
  const a = split(before);
  const b = split(after);
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return merge([
      { text: before, change: "removed" },
      { text: after, change: "added" },
    ]);
  }
  const width = b.length + 1;
  // common[i * width + j]: weight of the best common subsequence of a[i..] and b[j..].
  const common = new Uint32Array((a.length + 1) * width);
  const at = (i: number, j: number) => common[i * width + j] ?? 0;
  const match = (i: number, j: number) =>
    a[i] === b[j] ? at(i + 1, j + 1) + weight(a[i] ?? "") : -1;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i * width + j] = Math.max(match(i, j), at(i + 1, j), at(i, j + 1));
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (match(i, j) === at(i, j)) {
      parts.push({ text: a[i] ?? "" });
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      parts.push({ text: a[i++] ?? "", change: "removed" });
    } else {
      parts.push({ text: b[j++] ?? "", change: "added" });
    }
  }
  for (; i < a.length; i++) parts.push({ text: a[i] ?? "", change: "removed" });
  for (; j < b.length; j++) parts.push({ text: b[j] ?? "", change: "added" });
  return merge(tidy(parts));
}

/**
 * Keeps a changed phrase in one piece: a lone space between two changes belongs to them, and
 * within each run of changes what was removed comes before what was added. Without this,
 * "foto o un PDF" against "foto; no…" splits into "o", "un" and "PDF".
 */
function tidy(parts: readonly DiffPart[]): DiffPart[] {
  const changed = (part: DiffPart | undefined) => part?.change !== undefined;
  const spread = parts.flatMap((part, index): DiffPart[] =>
    part.change === undefined &&
    /^\s+$/.test(part.text) &&
    changed(parts[index - 1]) &&
    changed(parts[index + 1])
      ? [
          { text: part.text, change: "removed" },
          { text: part.text, change: "added" },
        ]
      : [part],
  );
  const result: DiffPart[] = [];
  let run: DiffPart[] = [];
  const flush = () => {
    result.push(
      ...run.filter((part) => part.change === "removed"),
      ...run.filter((part) => part.change === "added"),
    );
    run = [];
  };
  for (const part of spread) {
    if (part.change === undefined) {
      flush();
      result.push(part);
    } else {
      run.push(part);
    }
  }
  flush();
  return result;
}

/**
 * A modified text as the person reads it: the final text with the added words marked and, only
 * when words were removed, the approved text with those marked.
 */
export function textAndBefore(
  old: string,
  now: string,
): { readonly text: readonly DiffPart[]; readonly before?: readonly DiffPart[] } {
  const parts = wordDiff(old, now);
  const text = merge(parts.filter((part) => part.change !== "removed"));
  if (!parts.some((part) => part.change === "removed")) return { text };
  return { text, before: merge(parts.filter((part) => part.change !== "added")) };
}
