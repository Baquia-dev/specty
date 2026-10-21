// SPDX-License-Identifier: Apache-2.0
import { fold } from "./i18n";

/** Prefixes of spec items: assumptions, criteria, tasks, risks and epic slices. */
export type ItemPrefix = "A" | "AC" | "T" | "R" | "C";

export const ITEM_PREFIXES: readonly ItemPrefix[] = ["A", "AC", "T", "R", "C"];

export interface ItemId {
  readonly prefix: ItemPrefix;
  readonly number: number;
  readonly id: string;
}

/** `AAAAMMDD-slug`, for example `20261020-evolucion-academica`. */
export const CHANGE_ID = /^\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ITEM_ID = /^(AC|A|T|R|C)0*([1-9]\d*)$/i;
const PREFIX_BY_TEXT: Readonly<Record<string, ItemPrefix>> = {
  A: "A",
  AC: "AC",
  T: "T",
  R: "R",
  C: "C",
};

/** Parses `ac01`, `AC1` or `T3` into a canonical id; returns undefined for anything else. */
export function parseItemId(raw: string): ItemId | undefined {
  const match = ITEM_ID.exec(raw.trim());
  const prefix = PREFIX_BY_TEXT[(match?.[1] ?? "").toUpperCase()];
  if (match === null || prefix === undefined) return undefined;
  const number = Number(match[2]);
  return { prefix, number, id: `${prefix}${number}` };
}

export function slugify(title: string, maxLength = 48): string {
  const slug = fold(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");
  return slug.length > 0 ? slug : "change";
}

/** Builds a change id from a local date and a title. */
export function makeChangeId(date: Date, title: string): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}-${slugify(title)}`;
}
