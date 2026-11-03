// SPDX-License-Identifier: Apache-2.0
import { parse as parseYaml, stringify } from "yaml";
import * as z from "zod";
import { isDay } from "./triggers";

// An entry of Specty's memory (formats.md §1, ADR 0016): a markdown file of its own branch,
// `entries/<id>.md`, with its state in the frontmatter and its text below.

export const MEMORY_KINDS = ["pending", "improvement", "reminder", "decision", "lesson"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_STATUSES = ["open", "taken", "done", "drop-proposed", "dropped"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface MemoryEntry {
  /** `P3` for pending items, improvements and reminders; `D2` for decisions. */
  readonly id: string;
  readonly kind: MemoryKind;
  readonly status: MemoryStatus;
  /** ISO 8601, in UTC. */
  readonly created: string;
  /** The open change of the folder it was added in, if any, and who added it. */
  readonly origin: {
    readonly change?: string;
    /** The agent that added it, `agent` when Specty does not know which, or `person`. */
    readonly by: string;
  };
  /** The person's literal words: a decision always has them. */
  readonly quote?: string;
  /** The paths of the code it is about (globs allowed): a lesson always has them. */
  readonly paths?: readonly string[];
  /** A reminder's day (YYYY-MM-DD, local): it stays out of the sessions until then. */
  readonly due?: string;
  /** The open change a reminder waits for: it stays out of the sessions until that one is archived. */
  readonly onClose?: string;
  /** The change that took it (`specty new --resolves`), and when. */
  readonly taken?: { readonly change: string; readonly at: string };
  /** Who asked to drop it, why and when: proposed by an agent, or dropped by the person. */
  readonly drop?: { readonly reason: string; readonly by: string; readonly at: string };
  /** Who marked it done, or dropped it, and when. */
  readonly closed?: { readonly at: string; readonly by: string };
  /** Written for someone without the conversation's context. */
  readonly text: string;
}

const Text = z.string().min(1);

const EntrySchema = z
  .strictObject({
    id: z.string().regex(/^[PD][1-9]\d*$/),
    kind: z.enum(MEMORY_KINDS),
    status: z.enum(MEMORY_STATUSES),
    created: Text,
    origin: z.strictObject({ change: Text.optional(), by: Text }),
    quote: Text.optional(),
    paths: z.array(Text).min(1).optional(),
    due: z.string().refine(isDay).optional(),
    onClose: Text.optional(),
    taken: z.strictObject({ change: Text, at: Text }).optional(),
    drop: z.strictObject({ reason: Text, by: Text, at: Text }).optional(),
    closed: z.strictObject({ at: Text, by: Text }).optional(),
  })
  .refine((entry) => entry.kind !== "decision" || entry.quote !== undefined, {
    message: "a decision needs the person's quote",
    path: ["quote"],
  })
  .refine((entry) => entry.kind !== "lesson" || entry.paths !== undefined, {
    message: "a lesson needs the paths it is about",
    path: ["paths"],
  })
  .refine((entry) => entry.kind === "reminder" || entry.due === undefined, {
    message: "only a reminder waits for a day",
    path: ["due"],
  })
  .refine((entry) => entry.kind === "reminder" || entry.onClose === undefined, {
    message: "only a reminder waits for a change",
    path: ["onClose"],
  })
  .refine((entry) => entry.id.startsWith(prefixOf(entry.kind)));

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** The entry an `entries/<id>.md` file holds; undefined when it is not a valid one. */
export function parseEntry(markdown: string): MemoryEntry | undefined {
  const [, raw, body] = FRONTMATTER.exec(markdown.replaceAll("\r\n", "\n")) ?? [];
  if (raw === undefined) return undefined;
  const parsed = EntrySchema.safeParse(loadYaml(raw));
  const text = (body ?? "").trim();
  if (!parsed.success || text.length === 0) return undefined;
  const { id, kind, status, created, origin } = parsed.data;
  return {
    id,
    kind,
    status,
    created,
    origin: { ...(origin.change !== undefined ? { change: origin.change } : {}), by: origin.by },
    ...optionalFields(parsed.data),
    text,
  };
}

/** The fields an entry may lack, only those its frontmatter has. */
function optionalFields({
  quote,
  paths,
  due,
  onClose,
  taken,
  drop,
  closed,
}: z.infer<typeof EntrySchema>): Pick<
  MemoryEntry,
  "quote" | "paths" | "due" | "onClose" | "taken" | "drop" | "closed"
> {
  return {
    ...(quote !== undefined ? { quote } : {}),
    ...(paths !== undefined ? { paths } : {}),
    ...(due !== undefined ? { due } : {}),
    ...(onClose !== undefined ? { onClose } : {}),
    ...(taken !== undefined ? { taken: { change: taken.change, at: taken.at } } : {}),
    ...(drop !== undefined ? { drop: { reason: drop.reason, by: drop.by, at: drop.at } } : {}),
    ...(closed !== undefined ? { closed: { at: closed.at, by: closed.by } } : {}),
  };
}

/** The markdown of `entry`, as `parseEntry` reads it back. */
export function serializeEntry(entry: MemoryEntry): string {
  const { text, ...front } = entry;
  return `---\n${stringify(front, { lineWidth: 0 })}---\n\n${text.trim()}\n`;
}

/** The id of a new entry of `kind`: the highest of its prefix among `ids`, plus one. */
export function nextEntryId(kind: MemoryKind, ids: readonly string[]): string {
  const prefix = prefixOf(kind);
  const numbers = ids.flatMap((id) => {
    const parsed = parseEntryId(id);
    return parsed?.startsWith(prefix) === true ? [Number(parsed.slice(1))] : [];
  });
  return `${prefix}${Math.max(0, ...numbers) + 1}`;
}

/** `p3` or `P03` as `P3`; undefined for anything that is not an entry's id. */
export function parseEntryId(raw: string): string | undefined {
  const match = /^([PD])0*([1-9]\d*)$/i.exec(raw.trim());
  return match === null ? undefined : `${(match[1] ?? "").toUpperCase()}${match[2]}`;
}

/** Open until it is done or dropped: taken or proposed to drop, it still waits for something. */
export function isOpenEntry(entry: MemoryEntry): boolean {
  return entry.status !== "done" && entry.status !== "dropped";
}

/** What a commit of the memory's branch does to its entry. */
export type MemoryOperation =
  | "add"
  | "done"
  | "take"
  | "free"
  | "drop"
  | "propose-drop"
  | "keep"
  /** A reminder whose change was archived: it loses `onClose`. */
  | "fire";

/** Why `specty new --resolves` cannot take an entry. */
export type ClaimProblem =
  | { readonly reason: "unknown"; readonly id: string }
  /** Done, dropped or proposed to drop. */
  | { readonly reason: "unavailable"; readonly entry: MemoryEntry }
  /** A reminder or a decision: only pending items and improvements are taken. */
  | { readonly reason: "not-work"; readonly entry: MemoryEntry }
  /** An open change took it first. */
  | { readonly reason: "taken"; readonly entry: MemoryEntry; readonly change: string };

/**
 * The entries `ids` names, ready to be taken, or the first that cannot be. One taken by a change
 * that is no longer among the `open` ones is free again.
 */
export function claimable(
  ids: readonly string[],
  entries: readonly MemoryEntry[],
  open: ReadonlySet<string>,
): { readonly entries: readonly MemoryEntry[] } | { readonly problem: ClaimProblem } {
  const found: MemoryEntry[] = [];
  for (const raw of ids) {
    const id = parseEntryId(raw) ?? raw.trim();
    const entry = entries.find((known) => known.id === id);
    const problem = claimProblem(id, entry, open);
    if (problem !== undefined) return { problem };
    if (entry !== undefined && !found.includes(entry)) found.push(entry);
  }
  return { entries: found };
}

function claimProblem(
  id: string,
  entry: MemoryEntry | undefined,
  open: ReadonlySet<string>,
): ClaimProblem | undefined {
  if (entry === undefined) return { reason: "unknown", id };
  if (entry.status !== "open" && entry.status !== "taken") return { reason: "unavailable", entry };
  if (!isWork(entry)) return { reason: "not-work", entry };
  const change = entry.status === "taken" ? entry.taken?.change : undefined;
  return change !== undefined && open.has(change) ? { reason: "taken", entry, change } : undefined;
}

/** The pending items and improvements nobody took, by date. */
export function freeWork(entries: readonly MemoryEntry[]): readonly MemoryEntry[] {
  return byDate(entries.filter((entry) => isWork(entry) && entry.status === "open"));
}

/** `entry`, taken by `change` at `at`. */
export function takenEntry(entry: MemoryEntry, change: string, at: string): MemoryEntry {
  return { ...entry, status: "taken", taken: { change, at } };
}

/**
 * `entry` once the change that took it is archived: done, with who closed it and when, if it
 * closed; open again, without the change, if it was cancelled.
 */
export function settledEntry(
  entry: MemoryEntry,
  closed?: { readonly at: string; readonly by: string },
): MemoryEntry {
  if (closed !== undefined) return { ...entry, status: "done", closed };
  const { taken: _taken, ...free } = entry;
  return { ...free, status: "open" };
}

const NONE = new Set(["ninguno", "ninguna", "none"]);

/**
 * The follow-ups of a closing that become pending items, trimmed and once each. Left out: an
 * empty one, one that says there are none, one that cites an entry of the memory (readable or
 * not, as `ids` holds them) and one with the text of an open entry.
 */
export function harvestable(
  items: readonly string[],
  memory: { readonly entries: readonly MemoryEntry[]; readonly ids: readonly string[] },
): string[] {
  const known = new Set(memory.ids);
  const open = new Set(memory.entries.filter(isOpenEntry).map((entry) => entry.text.trim()));
  const kept: string[] = [];
  for (const item of items) {
    const text = item.trim();
    const none = NONE.has(text.replace(/\.$/, "").toLowerCase());
    const cites = (text.match(/\b[PD][1-9]\d*\b/g) ?? []).some((id) => known.has(id));
    if (text.length > 0 && !none && !cites && !open.has(text) && !kept.includes(text))
      kept.push(text);
  }
  return kept;
}

/**
 * `entry` with a request to drop it: dropped, closed by whoever asked, when the `person` asks;
 * only proposed to drop when an agent does, since dropping is the person's alone (ADR 0016).
 */
export function droppedEntry(
  entry: MemoryEntry,
  drop: { readonly reason: string; readonly by: string; readonly at: string },
  person: boolean,
): MemoryEntry {
  return person
    ? { ...entry, status: "dropped", drop, closed: { at: drop.at, by: drop.by } }
    : { ...entry, status: "drop-proposed", drop };
}

/** An entry proposed to drop, open again without the proposal. */
export function keptEntry(entry: MemoryEntry): MemoryEntry {
  const { drop: _drop, ...kept } = entry;
  return { ...kept, status: "open" };
}

/** The open reminders that wait for `change` to be archived, by date: they fire when it is. */
export function waitingFor(
  entries: readonly MemoryEntry[],
  change: string,
): readonly MemoryEntry[] {
  return byDate(
    entries.filter(
      (entry) => entry.kind === "reminder" && isOpenEntry(entry) && entry.onClose === change,
    ),
  );
}

/** A reminder whose change was archived: without `onClose`, every session sees it. */
export function firedEntry(entry: MemoryEntry): MemoryEntry {
  const { onClose: _onClose, ...fired } = entry;
  return fired;
}

/** By date and, on the same date, the P ids before the D ones, each by number. */
export function byDate(entries: readonly MemoryEntry[]): readonly MemoryEntry[] {
  const number = (entry: MemoryEntry) => Number(entry.id.slice(1));
  return entries.toSorted(
    (a, b) =>
      a.created.localeCompare(b.created) ||
      b.id.charAt(0).localeCompare(a.id.charAt(0)) ||
      number(a) - number(b),
  );
}

/** Pending items and improvements: what a change resolves. */
function isWork(entry: MemoryEntry): boolean {
  return entry.kind === "pending" || entry.kind === "improvement";
}

function prefixOf(kind: MemoryKind): "P" | "D" {
  return kind === "decision" ? "D" : "P";
}

function loadYaml(raw: string): unknown {
  try {
    return parseYaml(raw);
  } catch {
    return undefined;
  }
}
