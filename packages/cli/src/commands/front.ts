// SPDX-License-Identifier: Apache-2.0
import {
  assignable,
  assignToFront,
  type Front,
  findFront,
  frontAddedCard,
  frontAssignedCard,
  frontCommitSubject,
  frontFreedCard,
  frontListCard,
  frontRefusalCard,
  frontTakenCard,
  isFrontName,
  type Output,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import type { ReportOutput } from "../check/provider";
import type { Session } from "../session";
import { type LiveHold, liveHolds, releaseFront } from "../store/front-owners";
import { editMemory, readMemory } from "../store/memory";
import { writerOf } from "./memory";

type Run = (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>;

/**
 * Registers `specty front` (ADR 0016): the fronts of work of Specty's memory, which the agent
 * creates and fills when the person asks it to share out the work, from any folder of the clone.
 */
export function frontCommand(program: Command, run: Run): void {
  const front = program
    .command("front")
    .description("fronts of work: the entries of Specty's memory each session takes, in order")
    .action(() => run(listFronts)());
  front
    .command("add")
    .description("add a front, with what it covers")
    .argument("<name>")
    .argument("<text>")
    .option("--path <globs...>", "the paths of the code it covers")
    .action((name: string, text: string, options: { path?: string[] }) =>
      run((session) => addFront(session, name, text, options.path ?? []))(),
    );
  front
    .command("assign")
    .description("put entries at the end of a front, in order; they leave any other front")
    .argument("<front>")
    .argument("<ids...>")
    .action((name: string, ids: string[]) => run((session) => assignEntries(session, name, ids))());
  front
    .command("take")
    .description(
      "take a front: the guard of the agent's tool records its conversation as the owner",
    )
    .argument("<front>")
    .action((name: string) => run((session) => takeFront(session, name))());
  front
    .command("free")
    .description("free a front: it has no owner after this")
    .argument("<front>")
    .action((name: string) => run((session) => freeFront(session, name))());
}

/** `specty front`: every front with who holds it and its open entries, in order. */
async function listFronts(session: Session): Promise<Output> {
  const { fronts, entries } = await readMemory(session.git, session.config.memory.branch);
  return frontListCard(fronts, entries, session.cards, await ownersOf(session));
}

/** The live owners of the fronts (`memory.orphanAfterMin`, ADR 0016). */
function ownersOf(session: Session): Promise<LiveHold[]> {
  const now = session.environment.now();
  return liveHolds(session.git, now, session.config.memory.orphanAfterMin);
}

/**
 * `specty front take`: the front with who holds it, its entries and the first free one. The guard
 * of the agent's tool recorded its conversation as the owner before the command ran (ADR 0016).
 */
async function takeFront(session: Session, name: string): Promise<Output> {
  const { fronts, entries } = await readMemory(session.git, session.config.memory.branch);
  const front = findFront(fronts, name);
  if (front === undefined) return unknownFront(session, name);
  const owner = (await ownersOf(session)).find((hold) => hold.front === front.name);
  return frontTakenCard(front, entries, owner, session.cards);
}

/** `specty front free`: the front has no owner; the guard does not let one agent free another's. */
async function freeFront(session: Session, name: string): Promise<Output> {
  const { fronts } = await readMemory(session.git, session.config.memory.branch);
  const front = findFront(fronts, name);
  if (front === undefined) return unknownFront(session, name);
  const owner = (await ownersOf(session)).find((hold) => hold.front === front.name);
  await releaseFront(session.git, front.name);
  return frontFreedCard(front, owner, session.cards);
}

function unknownFront(session: Session, name: string): Output {
  return frontRefusalCard({ reason: "unknown-front", name: name.trim() }, session.cards);
}

/** `specty front add`: a new front, with this folder's open change and who creates it. */
async function addFront(
  session: Session,
  rawName: string,
  rawText: string,
  rawPaths: readonly string[],
): Promise<Output> {
  const name = rawName.trim();
  const text = rawText.trim();
  const paths = [...new Set(rawPaths.map((path) => path.trim()))].filter((path) => path.length > 0);
  if (!isFrontName(name)) return frontRefusalCard({ reason: "bad-name", name }, session.cards);
  if (text.length === 0) return frontRefusalCard({ reason: "empty" }, session.cards);
  const { target, author } = await writerOf(session);
  const change = target.trailers["Specty-Change"];
  return editMemory(session.git, target, ({ fronts }) => {
    const known = findFront(fronts, name);
    if (known !== undefined)
      return { result: frontRefusalCard({ reason: "exists", front: known }, session.cards) };
    const front: Front = {
      name,
      created: session.environment.now().toISOString(),
      origin: { ...(change !== undefined ? { change } : {}), by: author },
      ...(paths.length > 0 ? { paths } : {}),
      items: [],
      text,
    };
    return {
      write: {
        fronts: [front],
        front: name,
        subject: frontCommitSubject("add", name, [], session.lang),
      },
      result: frontAddedCard(front, target.branch, session.cards),
    };
  });
}

/** `specty front assign`: `ids` at the end of the front, in that order, out of any other. */
async function assignEntries(
  session: Session,
  name: string,
  ids: readonly string[],
): Promise<Output> {
  const { target } = await writerOf(session);
  return editMemory(session.git, target, ({ fronts, entries }) => {
    const front = findFront(fronts, name);
    if (front === undefined) return { result: unknownFront(session, name) };
    const checked = assignable(ids, entries);
    if ("problem" in checked) return { result: frontRefusalCard(checked.problem, session.cards) };
    const { fronts: changed, moved } = assignToFront(fronts, front.name, checked.ids);
    // `assignToFront` gives the front assigned to first.
    const assigned = changed[0] ?? front;
    return {
      write: {
        fronts: changed,
        front: front.name,
        subject: frontCommitSubject("assign", front.name, checked.ids, session.lang),
      },
      result: frontAssignedCard(assigned, checked.ids, moved, session.cards),
    };
  });
}
