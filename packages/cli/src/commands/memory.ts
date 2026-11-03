// SPDX-License-Identifier: Apache-2.0
import {
  type ChangeState,
  claimable,
  freeWork,
  harvestable,
  isOpenEntry,
  MEMORY_KINDS,
  type MemoryEntry,
  type MemoryKind,
  type MemoryRefusal,
  memoryAddedCard,
  memoryDoneCard,
  memoryListCard,
  memoryRefusalCard,
  nextEntryId,
  type Output,
  parseEntryId,
  resolvesRefusalCard,
  settledEntry,
  takenEntry,
} from "@baquia-dev/specty-core";
import { type Command, Option } from "commander";
import type { ReportOutput } from "../check/provider";
import { isFinished, resolveActive } from "../flow/active";
import type { Session } from "../session";
import { editMemory, type MemoryTarget, readMemory } from "../store/memory";
import { dropEntry, keepEntry, type MemoryWriter } from "./memory-drop";
import { openChanges } from "./status";

type Run = (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>;

interface AddOptions {
  readonly kind: MemoryKind;
  readonly quote?: string;
  readonly path?: readonly string[];
}

/**
 * Registers `specty memory` (ADR 0016): the agent and the person list the memory's entries and
 * add to it from any folder of the clone.
 */
export function memoryCommand(program: Command, run: Run): void {
  const memory = program
    .command("memory")
    .description("Specty's memory: pending items, improvements, reminders and decisions")
    .option("--all", "also the entries done or dropped")
    .action((options: { all?: boolean }) =>
      run((session) => listMemory(session, options.all === true))(),
    );
  memory
    .command("add")
    .description("add an entry, written for someone without this conversation's context")
    .argument("<text>")
    .addOption(new Option("--kind <kind>", "what it is").choices(MEMORY_KINDS).default("pending"))
    .option("--quote <quote>", "the person's literal words; a decision needs them")
    .option("--path <globs...>", "the paths of the code it is about; a lesson needs them")
    .action((text: string, options: AddOptions) =>
      run((session) => addEntry(session, text, options))(),
    );
  memory
    .command("done")
    .description("mark a reminder done")
    .argument("<id>")
    .action((id: string) => run((session) => markDone(session, id))());
  memory
    .command("drop")
    .description(
      "drop an entry; from an agent, in delegated mode too, only a proposal to the person",
    )
    .argument("<id>")
    .option("--reason <reason>", "why it is dropped")
    .action((id: string, options: { reason?: string }) =>
      run(async (session) => dropEntry(session, id, options.reason, await writerOf(session)))(),
    );
  memory
    .command("keep")
    .description("keep an entry proposed to drop: it is open again")
    .argument("<id>")
    .action((id: string) =>
      run(async (session) => keepEntry(session, id, await writerOf(session)))(),
    );
}

/** Who writes to the memory from this folder: its open change's trailers, and the author. */
export async function writerOf(session: Session): Promise<MemoryWriter> {
  return { target: targetOf(session, await openChange(session)), author: authorOf(session) };
}

/** What the person decides on an entry from `specty ui` (ADR 0016). */
export type MemoryVerb = "drop" | "keep" | "done";

/**
 * A decision of the person's on entry `id`, as `memory drop`, `memory keep` or `memory done`
 * would take it: from `specty ui`, the session is the person's on its screen.
 */
export async function personMemoryAction(
  session: Session,
  id: string,
  verb: MemoryVerb,
  reason: string | undefined,
): Promise<Output> {
  if (verb === "done") return markDone(session, id);
  const writer = await writerOf(session);
  return verb === "drop" ? dropEntry(session, id, reason, writer) : keepEntry(session, id, writer);
}

/** `specty memory`: the open entries, or every one with `--all`. */
async function listMemory(session: Session, all: boolean): Promise<Output> {
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  return memoryListCard(entries, { all }, session.cards);
}

/** `specty memory add`: a new entry, with this folder's open change and who adds it. */
async function addEntry(session: Session, text: string, options: AddOptions): Promise<Output> {
  const written = text.trim();
  const quote = options.quote?.trim() ?? "";
  const paths = [...new Set((options.path ?? []).map((path) => path.trim()))].filter(
    (path) => path.length > 0,
  );
  const refusal = addRefusal(written, quote, paths, options.kind);
  if (refusal !== undefined) return memoryRefusalCard(refusal, session.cards);
  const change = await openChange(session);
  const target = targetOf(session, change);
  return editMemory(session.git, target, ({ ids }) => {
    const entry: MemoryEntry = {
      id: nextEntryId(options.kind, ids),
      kind: options.kind,
      status: "open",
      created: session.environment.now().toISOString(),
      origin: { ...(change !== undefined ? { change } : {}), by: authorOf(session) },
      ...(quote.length > 0 ? { quote } : {}),
      ...(paths.length > 0 ? { paths } : {}),
      text: written,
    };
    return {
      write: { entry, operation: "add" },
      result: memoryAddedCard(entry, target.branch, session.cards),
    };
  });
}

/** Why `memory add` writes nothing: no text, a decision without a quote or a lesson without paths. */
function addRefusal(
  written: string,
  quote: string,
  paths: readonly string[],
  kind: MemoryKind,
): MemoryRefusal | undefined {
  if (written.length === 0) return { reason: "empty" };
  if (kind === "decision" && quote.length === 0) return { reason: "no-quote" };
  if (kind === "lesson" && paths.length === 0) return { reason: "no-path" };
  return undefined;
}

/**
 * `specty memory done`: a reminder, done by whoever marks it. A pending item or an improvement is
 * done when the change that takes it closes, and a decision is never done.
 */
async function markDone(session: Session, raw: string): Promise<Output> {
  const id = parseEntryId(raw) ?? raw.trim();
  const target = targetOf(session, await openChange(session));
  return editMemory(session.git, target, ({ entries }) => {
    const found = openReminder(entries, id);
    if ("refusal" in found) return { result: memoryRefusalCard(found.refusal, session.cards) };
    const done: MemoryEntry = {
      ...found.reminder,
      status: "done",
      closed: { at: session.environment.now().toISOString(), by: authorOf(session) },
    };
    return {
      write: { entry: done, operation: "done" },
      result: memoryDoneCard(done, session.cards),
    };
  });
}

/** The open reminder `id`, or why it cannot be marked done. */
function openReminder(
  entries: readonly MemoryEntry[],
  id: string,
): { readonly reminder: MemoryEntry } | { readonly refusal: MemoryRefusal } {
  const entry = entries.find((known) => known.id === id);
  if (entry === undefined) return { refusal: { reason: "unknown", id } };
  if (entry.kind !== "reminder") return { refusal: { reason: "not-reminder", entry } };
  if (!isOpenEntry(entry)) return { refusal: { reason: "already-done", id } };
  return { reminder: entry };
}

/**
 * What `specty new --resolves` takes: the entries `ids` names, or the card of why it takes none.
 * The open changes are read only when some entry is taken, to say which one took it.
 */
export async function claimEntries(
  session: Session,
  ids: readonly string[],
): Promise<{ readonly entries: readonly MemoryEntry[] } | { readonly refusal: Output }> {
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  const open = entries.some((entry) => entry.status === "taken") ? await openChanges(session) : [];
  const claim = claimable(ids, entries, new Set(open.map((change) => change.id)));
  if ("entries" in claim) return claim;
  const { problem } = claim;
  if (problem.reason !== "taken") return { refusal: resolvesRefusalCard(problem, session.cards) };
  const by = open.find((change) => change.id === problem.change);
  // `claimable` only names a change among the open ones.
  if (by === undefined) throw new Error(`${problem.change}: not an open change`);
  // The first free one, even if `new` asked for it too: without the taken one, it can go on.
  const [free] = freeWork(entries);
  return {
    refusal: resolvesRefusalCard(
      { reason: "taken", entry: problem.entry, by, ...(free !== undefined ? { free } : {}) },
      session.cards,
    ),
  };
}

/**
 * Marks each of `claimed` taken by `change`, one commit each. One that changed since it was
 * checked, because another session took it first, stays as that session left it.
 */
export async function takeEntries(
  session: Session,
  change: string,
  claimed: readonly MemoryEntry[],
): Promise<void> {
  const target = targetOf(session, change);
  const at = session.environment.now().toISOString();
  for (const checked of claimed) {
    await editMemory(session.git, target, ({ entries }) => {
      const now = entries.find((entry) => entry.id === checked.id);
      if (
        now === undefined ||
        now.status !== checked.status ||
        now.taken?.change !== checked.taken?.change
      )
        return { result: undefined };
      return {
        write: { entry: takenEntry(now, change, at), operation: "take" },
        result: undefined,
      };
    });
  }
}

/** What a change leaves in the memory: a pending item, or with `paths` a lesson of those paths. */
export interface Harvest {
  readonly text: string;
  readonly paths?: readonly string[];
}

/**
 * What a change leaves in the memory, with that change as its origin, one commit each: the
 * follow-ups of its closing as pending items, and the risks its acceptance takes as lessons.
 * Those already in the memory are left out (`harvestable`). The ids of the entries it added.
 */
export async function harvestEntries(
  session: Session,
  state: ChangeState,
  items: readonly Harvest[],
): Promise<string[]> {
  const target = targetOf(session, state.id);
  const texts = items.map(({ text }) => text);
  const added: string[] = [];
  for (const text of harvestable(texts, await readMemory(session.git, target.branch))) {
    const paths = items.find((item) => item.text.trim() === text)?.paths;
    const kind = paths === undefined ? "pending" : "lesson";
    const id = await editMemory(session.git, target, (memory) => {
      if (harvestable([text], memory).length === 0) return { result: undefined };
      const entry: MemoryEntry = {
        id: nextEntryId(kind, memory.ids),
        kind,
        status: "open",
        created: session.environment.now().toISOString(),
        origin: { change: state.id, by: authorOf(session) },
        ...(paths === undefined ? {} : { paths }),
        text,
      };
      return { write: { entry, operation: "add" }, result: entry.id };
    });
    if (id !== undefined) added.push(id);
  }
  return added;
}

/**
 * The entries a change took, once it is archived: done if it closed, free again if it was
 * cancelled, one commit each. Only those still taken by it; none, no commit.
 */
export async function settleEntries(session: Session, state: ChangeState): Promise<void> {
  const takenHere = (entry: MemoryEntry) =>
    entry.status === "taken" && entry.taken?.change === state.id;
  const { entries } = await readMemory(session.git, session.config.memory.branch);
  const ids = entries.filter(takenHere).map((entry) => entry.id);
  if (ids.length === 0) return;
  const target = targetOf(session, state.id);
  const closed =
    state.phase === "done"
      ? { at: session.environment.now().toISOString(), by: authorOf(session) }
      : undefined;
  for (const id of ids) {
    await editMemory(session.git, target, (memory) => {
      const now = memory.entries.find((entry) => entry.id === id);
      if (now === undefined || !takenHere(now)) return { result: undefined };
      const entry = settledEntry(now, closed);
      return { write: { entry, operation: closed ? "done" : "free" }, result: undefined };
    });
  }
}

/** The open change of this folder, if any. */
async function openChange(session: Session): Promise<string | undefined> {
  const active = await resolveActive(session);
  return active === undefined || isFinished(active.state) ? undefined : active.state.id;
}

/** The agent Specty detects, `agent` when it does not know which, or `person`. */
function authorOf(session: Session): string {
  return session.actor === "human" ? "person" : (session.tool ?? "agent");
}

/** The memory's branch, and the trailers of Specty's commits that apply (formats.md §7). */
function targetOf(session: Session, change: string | undefined): MemoryTarget {
  return {
    branch: session.config.memory.branch,
    lang: session.lang,
    trailers: {
      ...(change !== undefined ? { "Specty-Change": change } : {}),
      ...(session.actor === "agent" && session.tool !== undefined
        ? { "Specty-Agent": session.tool }
        : {}),
    },
  };
}
