// SPDX-License-Identifier: Apache-2.0
import { parse as parseYaml, stringify } from "yaml";
import * as z from "zod";
import { isOpenEntry, type MemoryEntry, parseEntryId } from "./entries";

// A front of work of Specty's memory (formats.md §1, ADR 0016): a markdown file of its branch,
// `fronts/<name>.md`, with the pending items and improvements it holds, in the order they go.

export interface Front {
  /** Letters without accents, digits, `-` or `_`: also its file's name. */
  readonly name: string;
  /** ISO 8601, in UTC. */
  readonly created: string;
  /** The open change of the folder it was created in, if any, and who created it. */
  readonly origin: { readonly change?: string; readonly by: string };
  /** The paths of the code it covers (globs allowed). */
  readonly paths?: readonly string[];
  /** The ids of its entries, in the order they go. */
  readonly items: readonly string[];
  /** What it covers, written for someone without the conversation's context. */
  readonly text: string;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

const Text = z.string().min(1);

const FrontSchema = z.strictObject({
  name: z.string().regex(NAME),
  created: Text,
  origin: z.strictObject({ change: Text.optional(), by: Text }),
  paths: z.array(Text).min(1).optional(),
  items: z.array(Text),
});

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** Whether `name` can name a front: letters without accents, digits, `-` or `_`, up to 40. */
export function isFrontName(name: string): boolean {
  return NAME.test(name);
}

/** The front a `fronts/<name>.md` file holds; undefined when it is not a valid one. */
export function parseFront(markdown: string): Front | undefined {
  const [, raw, body] = FRONTMATTER.exec(markdown.replaceAll("\r\n", "\n")) ?? [];
  if (raw === undefined) return undefined;
  const parsed = FrontSchema.safeParse(loadYaml(raw));
  const text = (body ?? "").trim();
  if (!parsed.success || text.length === 0) return undefined;
  const { name, created, origin, paths, items } = parsed.data;
  return {
    name,
    created,
    origin: { ...(origin.change !== undefined ? { change: origin.change } : {}), by: origin.by },
    ...(paths !== undefined ? { paths } : {}),
    items,
    text,
  };
}

/** The markdown of `front`, as `parseFront` reads it back. */
export function serializeFront(front: Front): string {
  const { text, ...data } = front;
  return `---\n${stringify(data, { lineWidth: 0 })}---\n\n${text.trim()}\n`;
}

/** The front called `name`, without telling capitals apart. */
export function findFront(fronts: readonly Front[], name: string): Front | undefined {
  const wanted = name.trim().toLowerCase();
  return fronts.find((front) => front.name.toLowerCase() === wanted);
}

/** Why `front assign` cannot put an entry in a front. */
export type AssignProblem =
  | { readonly reason: "unknown"; readonly id: string }
  /** A reminder, a decision or a lesson: only pending items and improvements go in a front. */
  | { readonly reason: "not-work"; readonly entry: MemoryEntry }
  /** Done or dropped. */
  | { readonly reason: "closed"; readonly entry: MemoryEntry };

/**
 * The ids `ids` names, as the memory writes them and once each, when every one is an open
 * pending item or improvement; otherwise the first problem.
 */
export function assignable(
  ids: readonly string[],
  entries: readonly MemoryEntry[],
): { readonly ids: readonly string[] } | { readonly problem: AssignProblem } {
  const found: string[] = [];
  for (const raw of ids) {
    const id = parseEntryId(raw) ?? raw.trim();
    const entry = entries.find((known) => known.id === id);
    if (entry === undefined) return { problem: { reason: "unknown", id } };
    if (entry.kind !== "pending" && entry.kind !== "improvement")
      return { problem: { reason: "not-work", entry } };
    if (!isOpenEntry(entry)) return { problem: { reason: "closed", entry } };
    if (!found.includes(id)) found.push(id);
  }
  return { ids: found };
}

/** The entries an assignment took out of another front. */
export interface FrontMove {
  readonly front: string;
  readonly ids: readonly string[];
}

/**
 * The fronts that change when `ids` go to the end of front `name`, in that order: that front
 * first, then those they leave, which `moved` names with the entries each lost. Front `name`
 * must exist.
 */
export function assignToFront(
  fronts: readonly Front[],
  name: string,
  ids: readonly string[],
): { readonly fronts: readonly Front[]; readonly moved: readonly FrontMove[] } {
  const target = findFront(fronts, name);
  if (target === undefined) throw new Error(`${name}: no such front`);
  const changed: Front[] = [
    { ...target, items: [...target.items.filter((id) => !ids.includes(id)), ...ids] },
  ];
  const moved: FrontMove[] = [];
  for (const front of fronts) {
    if (front === target) continue;
    const leaving = ids.filter((id) => front.items.includes(id));
    if (leaving.length === 0) continue;
    changed.push({ ...front, items: front.items.filter((id) => !ids.includes(id)) });
    moved.push({ front: front.name, ids: leaving });
  }
  return { fronts: changed, moved };
}

function loadYaml(raw: string): unknown {
  try {
    return parseYaml(raw);
  } catch {
    return undefined;
  }
}
