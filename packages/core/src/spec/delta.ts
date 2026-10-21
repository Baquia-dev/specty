// SPDX-License-Identifier: Apache-2.0
import { type ItemPrefix, parseItemId } from "../ids";
import { itemHashes } from "./canonical";
import { SECTION_ORDER, type Spec } from "./model";

export type DeltaChange = "added" | "removed" | "modified";

export type DeltaKind =
  | "frontmatter"
  | "title"
  | "section"
  | "assumption"
  | "criterion"
  | "task"
  | "risk"
  | "slice"
  | "file";

export interface DeltaEntry {
  /** `frontmatter`, `title`, `section:<key>`, an item id such as `T3`, or `file:<path>`. */
  readonly key: string;
  readonly kind: DeltaKind;
  readonly change: DeltaChange;
}

export interface SpecDelta {
  readonly entries: readonly DeltaEntry[];
  readonly isEmpty: boolean;
}

const KIND_BY_PREFIX: Readonly<Record<ItemPrefix, DeltaKind>> = {
  A: "assumption",
  AC: "criterion",
  T: "task",
  R: "risk",
  C: "slice",
};

/** What changed between two revisions, item by item. Task checkboxes are ignored. */
export function specDelta(before: Spec, after: Spec): SpecDelta {
  const previous = itemHashes(before);
  const current = itemHashes(after);
  const keys = [...new Set([...previous.keys(), ...current.keys()])];
  const entries = keys
    .flatMap((key): DeltaEntry[] => {
      const old = previous.get(key);
      const now = current.get(key);
      if (old === now) return [];
      const change: DeltaChange =
        old === undefined ? "added" : now === undefined ? "removed" : "modified";
      return [{ key, kind: kindOf(key), change }];
    })
    .toSorted(compareKeys);
  return { entries, isEmpty: entries.length === 0 };
}

export function kindOf(key: string): DeltaKind {
  if (key === "frontmatter" || key === "title") return key;
  if (key.startsWith("section:")) return "section";
  if (key.startsWith("file:")) return "file";
  const prefix = parseItemId(key)?.prefix;
  return prefix === undefined ? "section" : KIND_BY_PREFIX[prefix];
}

/** Orders keys as they appear in a canonical spec. */
function compareKeys(a: DeltaEntry, b: DeltaEntry): number {
  const [rankA, subA] = rank(a.key);
  const [rankB, subB] = rank(b.key);
  if (rankA !== rankB) return rankA - rankB;
  return typeof subA === "number" && typeof subB === "number"
    ? subA - subB
    : String(subA).localeCompare(String(subB));
}

/** Item groups follow the canonical section order: assumptions, criteria, files, tasks… */
const GROUP_BY_PREFIX: Readonly<Record<ItemPrefix, number>> = {
  A: 10,
  AC: 11,
  T: 13,
  C: 14,
  R: 15,
};
const FILE_GROUP = 12;

function rank(key: string): readonly [number, number | string] {
  if (key === "frontmatter") return [0, 0];
  if (key === "title") return [1, 0];
  if (key.startsWith("section:")) {
    return [2, SECTION_ORDER.findIndex((section) => `section:${section}` === key)];
  }
  if (key.startsWith("file:")) return [FILE_GROUP, key];
  const parsed = parseItemId(key);
  return parsed === undefined ? [99, key] : [GROUP_BY_PREFIX[parsed.prefix], parsed.number];
}
