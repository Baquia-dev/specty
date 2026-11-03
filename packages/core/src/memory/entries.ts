// SPDX-License-Identifier: Apache-2.0
import { parse as parseYaml, stringify } from "yaml";
import * as z from "zod";

// An entry of Specty's memory (formats.md §1, ADR 0016): a markdown file of its own branch,
// `entries/<id>.md`, with its state in the frontmatter and its text below.

export const MEMORY_KINDS = ["pending", "improvement", "reminder", "decision"] as const;
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
    closed: z.strictObject({ at: Text, by: Text }).optional(),
  })
  .refine((entry) => entry.kind !== "decision" || entry.quote !== undefined, {
    message: "a decision needs the person's quote",
    path: ["quote"],
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
  const { id, kind, status, created, origin, quote, closed } = parsed.data;
  return {
    id,
    kind,
    status,
    created,
    origin: { ...(origin.change !== undefined ? { change: origin.change } : {}), by: origin.by },
    ...(quote !== undefined ? { quote } : {}),
    ...(closed !== undefined ? { closed: { at: closed.at, by: closed.by } } : {}),
    text,
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
