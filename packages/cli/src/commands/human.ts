// SPDX-License-Identifier: Apache-2.0
import {
  type ChangeState,
  checkStatus,
  decisionPostponedCard,
  headerOf,
  noActiveChangeCard,
  noSuchChangeCard,
  nothingChangedCard,
  nothingWaitsCard,
  notInteractiveCard,
  type Output,
  otherFolderNote,
  parseSpec,
  whichChangeQuestion,
} from "@baquia-dev/specty-core";
import { resolveActive } from "../flow/active";
import { awaits, type Located, locateChanges, type PersonAction } from "../flow/changes";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
import { posixRelative } from "../store/paths";

// Shared by the commands only a person may run.

export type { PersonAction } from "../flow/changes";

/** A person decides at their TTY, or the agent decides for them in delegated mode (ADR 0010). */
export function canDecide(session: Session): boolean {
  return session.environment.terminal.interactive || session.delegated;
}

export type Guarded =
  | { readonly kind: "output"; readonly output: Output }
  | { readonly kind: "change"; readonly change: StoredChange };

export async function humanChange(session: Session, action: string): Promise<Guarded> {
  if (!canDecide(session))
    return { kind: "output", output: notInteractiveCard(action, session.cards) };
  const change = await resolveActive(session);
  if (change === undefined) {
    return { kind: "output", output: noActiveChangeCard("person", session.cards) };
  }
  return { kind: "change", change };
}

export type Chosen =
  | { readonly kind: "session"; readonly session: Session }
  | { readonly kind: "output"; readonly output: Output };

/**
 * Where a person's decision applies, from any folder: the change named by `id`; else this
 * folder's change when it waits for the decision; else the only change of any worktree that
 * does; else the one the person picks. Returns a session in that change's folder. An agent's
 * command is not redirected: it acts on its own folder's change, or is refused.
 */
export async function personSession(
  session: Session,
  action: PersonAction,
  options: { readonly id?: string | undefined; readonly scope?: string | undefined },
): Promise<Chosen> {
  if (!session.environment.terminal.interactive) return { kind: "session", session };
  const located = await locateChanges(session);
  if (options.id !== undefined) return namedChange(session, located, options.id);
  const waiting: Located[] = [];
  for (const candidate of located) {
    if (await awaits(action, candidate, options.scope)) waiting.push(candidate);
  }
  if (waiting.some(({ current }) => current)) return { kind: "session", session };
  const [only] = waiting;
  if (only === undefined) {
    // This folder's change answers as before: nothing pending in its phase.
    if (located.some(({ current }) => current)) return { kind: "session", session };
    return { kind: "output", output: nothingWaitsCard(action, session.cards) };
  }
  if (waiting.length === 1) return chosen(session, only);
  return pickChange(session, waiting);
}

/** The change the person named by its id, wherever it lives. */
async function namedChange(
  session: Session,
  located: readonly Located[],
  id: string,
): Promise<Chosen> {
  const named = located.find(({ change }) => change.state.id === id);
  if (named !== undefined) return chosen(session, named);
  return { kind: "output", output: noSuchChangeCard(id, session.cards) };
}

/** Several changes wait for the decision: the person picks one, or none. */
async function pickChange(session: Session, waiting: readonly Located[]): Promise<Chosen> {
  const titles = await Promise.all(waiting.map(titleOf));
  const picked = await session.environment.terminal.choose(
    whichChangeQuestion(session.lang),
    waiting.map(({ change }, index) => ({
      value: change.state.id,
      label: `${change.state.id} · ${change.state.phase} — ${titles[index] ?? ""}`,
    })),
  );
  const match = waiting.find(({ change }) => change.state.id === picked);
  if (match === undefined) {
    return {
      kind: "output",
      output: nothingChangedCard(headerOf(), checkStatus(session.cards), session.cards),
    };
  }
  return chosen(session, match);
}

/** The session of the chosen change; when it lives in another folder, the person is told. */
async function chosen(session: Session, located: Located): Promise<Chosen> {
  if (located.current) return { kind: "session", session };
  const note = otherFolderNote(
    {
      id: located.change.state.id,
      title: await titleOf(located),
      folder: posixRelative(session.root, located.session.root),
    },
    session.lang,
  );
  session.environment.terminal.note(note.title, note.text);
  return { kind: "session", session: located.session };
}

async function titleOf({ change, session }: Located): Promise<string> {
  return parseSpec(await readSpec(change.files), { language: session.lang }).spec.title;
}

export function postponed(session: Session, state: ChangeState): Output {
  return decisionPostponedCard(state.id, state.phase, session.cards);
}
