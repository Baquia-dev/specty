// SPDX-License-Identifier: Apache-2.0
import {
  MEMORY_KINDS,
  type MemoryEntry,
  type MemoryKind,
  memoryAddedCard,
  memoryListCard,
  memoryRefusalCard,
  nextEntryId,
  type Output,
} from "@baquia-dev/specty-core";
import { type Command, Option } from "commander";
import type { ReportOutput } from "../check/provider";
import { isFinished, resolveActive } from "../flow/active";
import type { Session } from "../session";
import { editMemory, type MemoryTarget, readMemory } from "../store/memory";

type Run = (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>;

interface AddOptions {
  readonly kind: MemoryKind;
  readonly quote?: string;
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
    .action((text: string, options: AddOptions) =>
      run((session) => addEntry(session, text, options))(),
    );
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
  if (written.length === 0) return memoryRefusalCard({ reason: "empty" }, session.cards);
  if (options.kind === "decision" && quote.length === 0)
    return memoryRefusalCard({ reason: "no-quote" }, session.cards);
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
      text: written,
    };
    return {
      write: { entry, operation: "add" },
      result: memoryAddedCard(entry, target.branch, session.cards),
    };
  });
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
