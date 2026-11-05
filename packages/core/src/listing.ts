// SPDX-License-Identifier: Apache-2.0
// How a list of changes is searched and sorted: the UI's Inbox and the local server's pages of
// finished changes use these same functions, so a page appended to the list keeps its order.
import { fold, type Lang } from "./i18n";
import type { SizeLevel } from "./sizing/size";

/** The orders of a list of changes: what has waited longest, the most recent, title or size. */
export type ChangeSort = "waiting" | "recent" | "title" | "size";

export const CHANGE_SORTS: readonly ChangeSort[] = ["waiting", "recent", "title", "size"];

/** What the search looks at: a change's id and title, and its epic's id, title and slice. */
interface Searchable {
  readonly id: string;
  readonly title: string;
  readonly epic?: { readonly id: string; readonly title: string; readonly slice?: string };
}

/** What the orders look at: when the change entered its phase, its title, size and id. */
interface Sortable {
  readonly id: string;
  readonly title: string;
  readonly phaseSince: string;
  readonly size?: { readonly level: SizeLevel };
}

const SIZE: Readonly<Record<SizeLevel, number>> = { S: 1, M: 2, L: 3, XL: 4 };

/** Whether the title, the id or the epic contain the query, ignoring case, accents and spacing. */
export function matchesQuery(change: Searchable, query: string): boolean {
  const wanted = fold(query);
  if (wanted === "") return true;
  const { epic } = change;
  const fields = [change.title, change.id, epic?.title ?? "", epic?.id ?? "", epic?.slice ?? ""];
  return fields.some((field) => fold(field).includes(wanted));
}

/** `changes` in the order `sort`, in a new list; ties go by id, so every list agrees. */
export function sortChanges<T extends Sortable>(
  changes: readonly T[],
  sort: ChangeSort,
  lang: Lang,
): readonly T[] {
  const since = (change: T) => Date.parse(change.phaseSince);
  const size = (change: T) => (change.size === undefined ? 0 : SIZE[change.size.level]);
  const compare: Readonly<Record<ChangeSort, (a: T, b: T) => number>> = {
    waiting: (a, b) => since(a) - since(b),
    recent: (a, b) => since(b) - since(a),
    title: (a, b) => a.title.localeCompare(b.title, lang, { sensitivity: "base" }),
    size: (a, b) => size(b) - size(a) || since(a) - since(b),
  };
  const byId = (a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return changes.toSorted((a, b) => compare[sort](a, b) || byId(a, b));
}
