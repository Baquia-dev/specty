// SPDX-License-Identifier: Apache-2.0
import {
  type ChangeKind,
  type ChangeSummary,
  type MemoryEntry,
  type Phase,
  parseSpec,
} from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { locateChanges } from "../flow/changes";
import { readText } from "../io/files";
import type { Session } from "../session";
import { summaryOf } from "./finished";
import { archivedRecords } from "./records";

/**
 * What `GET /api/memory` says of the change an entry came from (`MemoryOrigin` in
 * packages/ui/src/data/records.ts): its title, kind and phase and, for a slice, its epic with its
 * title; of a change it does not find, only its id, as its title.
 */
interface Origin {
  readonly title: string;
  readonly kind?: ChangeKind;
  readonly phase?: Phase;
  readonly epic?: { readonly id: string; readonly title: string; readonly slice?: string };
}

/** What a change says of itself, as a list summarizes it. */
type Head = Pick<ChangeSummary, "title" | "kind" | "phase" | "epic">;

/**
 * Each change the entries came from (`origin.change`), by its id: the open ones as their specs and
 * states are, which win, and the archived ones from what the server keeps (`archivedRecords`),
 * with the summary kept with each. With no entry from a change, it reads nothing.
 */
export async function memoryOrigins(
  session: Session,
  entries: readonly MemoryEntry[],
): Promise<Readonly<Record<string, Origin>>> {
  const ids = [...new Set(entries.flatMap((entry) => entry.origin.change ?? []))];
  if (ids.length === 0) return {};
  const heads = new Map<string, Head>(
    (await archivedRecords(session)).map((record) => [record.state.id, summaryOf(record)]),
  );
  for (const [id, head] of await openHeads(session)) heads.set(id, head);
  return Object.fromEntries(ids.map((id) => [id, originOf(id, heads)]));
}

/** The open changes of every worktree, each as its spec and its state say. */
async function openHeads(session: Session): Promise<ReadonlyMap<string, Head>> {
  const heads = new Map<string, Head>();
  for (const { change } of await locateChanges(session)) {
    if (isFinished(change.state)) continue;
    const text = await readText(change.files.spec);
    const spec = text === undefined ? undefined : parseSpec(text).spec;
    const epic = spec?.frontmatter.epic;
    const slice = spec?.frontmatter.slice;
    heads.set(change.state.id, {
      title: spec?.title || change.state.id,
      kind: change.state.kind,
      phase: change.state.phase,
      ...(epic === undefined
        ? {}
        : { epic: { id: epic, ...(slice === undefined ? {} : { slice }) } }),
    });
  }
  return heads;
}

/**
 * The change `id` as `heads` say it, with the title of its epic, or its id when the epic is not
 * there either (the rule of `listedOf` in finished.ts); one not there, only its id.
 */
function originOf(id: string, heads: ReadonlyMap<string, Head>): Origin {
  const head = heads.get(id);
  if (head === undefined) return { title: id };
  const { title, kind, phase, epic } = head;
  return {
    title,
    kind,
    phase,
    ...(epic === undefined
      ? {}
      : { epic: { ...epic, title: heads.get(epic.id)?.title ?? epic.id } }),
  };
}
