// SPDX-License-Identifier: Apache-2.0

// When a new change looks like an open one (ADR 0016): Specty decides only the clear case, the
// same `follows`, and compares words for the rest, so the person decides what is doubtful.

/** What a change is, for telling whether another one duplicates it. */
export interface DuplicateCandidate {
  readonly title: string;
  /** The user's literal request (`new --request`), if it has one. */
  readonly request?: string;
  readonly follows: readonly string[];
}

/** Why a new change looks like an open one. */
export type DuplicateReason =
  | { readonly kind: "follows"; readonly change: string }
  | { readonly kind: "title" }
  | { readonly kind: "request" };

/** Words that say nothing of the work, in Spanish and English. */
const STOPWORDS = new Set([
  ...["los", "las", "del", "con", "por", "para", "que", "una", "uno", "unos", "unas", "sin"],
  ...["sus", "son", "como", "mas", "pero", "desde", "hasta", "entre", "sobre", "cada", "este"],
  ...["esta", "estos", "estas", "ese", "esa", "cuando", "donde", "hay", "muy", "todo", "todos"],
  ...["the", "and", "for", "with", "from", "into", "that", "this", "these", "those", "are"],
  ...["was", "its", "their", "when", "where", "each", "all", "any", "not", "but", "out", "own"],
]);

/** Simple roots: the first letters of each word. */
const ROOT = 5;

/**
 * Two texts are alike when they share at least half the significant words of the shorter one,
 * and at least two: words of three letters or more, without accents or case, without stopwords,
 * compared by their first five letters.
 */
export function similarTexts(a: string, b: string): boolean {
  const [shorter, longer] = [roots(a), roots(b)].toSorted((x, y) => x.size - y.size);
  if (shorter === undefined || longer === undefined) return false;
  const shared = [...shorter].filter((root) => longer.has(root)).length;
  return shared >= 2 && shared * 2 >= shorter.size;
}

/**
 * Why `candidate`, a change about to be created, looks like `other`, an open one: following the
 * same change first, then a similar title, then a similar request when both have one.
 */
export function duplicateReason(
  candidate: DuplicateCandidate,
  other: DuplicateCandidate,
): DuplicateReason | undefined {
  const followed = candidate.follows.find((id) => other.follows.includes(id));
  if (followed !== undefined) return { kind: "follows", change: followed };
  if (similarTexts(candidate.title, other.title)) return { kind: "title" };
  const { request } = candidate;
  if (request !== undefined && other.request !== undefined && similarTexts(request, other.request))
    return { kind: "request" };
  return undefined;
}

function roots(text: string): Set<string> {
  const words = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u);
  return new Set(
    words
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
      .map((word) => word.slice(0, ROOT)),
  );
}
