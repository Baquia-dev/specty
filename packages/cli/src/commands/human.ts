// SPDX-License-Identifier: Apache-2.0
import { relative } from "node:path";
import {
  blockedCard,
  type ChangeState,
  headerOf,
  notInteractiveCard,
  type Output,
  parseSpec,
  translator,
} from "@baquia-dev/specty-core";
import { resolveActive } from "../flow/active";
import { awaits, type Located, locateChanges, type PersonAction } from "../flow/changes";
import type { Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";

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
  const t = translator(session.lang);
  if (!canDecide(session))
    return { kind: "output", output: notInteractiveCard(action, session.cards) };
  const change = await resolveActive(session);
  if (change === undefined) {
    return {
      kind: "output",
      output: blockedCard(
        headerOf(),
        t("No hay un cambio activo.", "There is no active change."),
        t(
          `revisa \`${session.cards.command} status\`.`,
          `check \`${session.cards.command} status\`.`,
        ),
      ),
    };
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
  const t = translator(session.lang);
  const { terminal } = session.environment;
  if (!terminal.interactive) return { kind: "session", session };
  const located = await locateChanges(session);
  const status = t(
    `revisa \`${session.cards.command} status\`.`,
    `check \`${session.cards.command} status\`.`,
  );
  if (options.id !== undefined) {
    const named = located.find(({ change }) => change.state.id === options.id);
    if (named !== undefined) return chosen(session, named);
    const missing = t(`No hay ningún cambio ${options.id}.`, `There is no change ${options.id}.`);
    return { kind: "output", output: blockedCard(headerOf(), missing, status) };
  }
  const waiting: Located[] = [];
  for (const candidate of located) {
    if (await awaits(action, candidate, options.scope)) waiting.push(candidate);
  }
  const here = waiting.find(({ current }) => current);
  if (here !== undefined) return { kind: "session", session };
  const [only] = waiting;
  if (only === undefined) {
    // This folder's change answers as before: nothing pending in its phase.
    if (located.some(({ current }) => current)) return { kind: "session", session };
    const none = t(`Ningún cambio espera \`${action}\`.`, `No change waits for \`${action}\`.`);
    return { kind: "output", output: blockedCard(headerOf(), none, status) };
  }
  if (waiting.length === 1) return chosen(session, only);
  const titles = await Promise.all(waiting.map(titleOf));
  const picked = await terminal.choose(
    t("¿En qué cambio?", "Which change?"),
    waiting.map(({ change }, index) => ({
      value: change.state.id,
      label: `${change.state.id} · ${change.state.phase} — ${titles[index] ?? ""}`,
    })),
  );
  const match = waiting.find(({ change }) => change.state.id === picked);
  if (match === undefined) {
    const nothing = [t("Nada cambió.", "Nothing changed.")];
    return {
      kind: "output",
      output: { status: "ok", header: headerOf(), blocks: [{ lines: nothing }], next: status },
    };
  }
  return chosen(session, match);
}

/** The session of the chosen change; when it lives in another folder, the person is told. */
async function chosen(session: Session, located: Located): Promise<Chosen> {
  if (located.current) return { kind: "session", session };
  const t = translator(session.lang);
  const folder = relative(session.root, located.session.root);
  session.environment.terminal.note(
    t("Cambio", "Change"),
    t(
      `${located.change.state.id} — ${await titleOf(located)}, en ${folder}`,
      `${located.change.state.id} — ${await titleOf(located)}, in ${folder}`,
    ),
  );
  return { kind: "session", session: located.session };
}

async function titleOf({ change, session }: Located): Promise<string> {
  return parseSpec(await readSpec(change.files), { language: session.lang }).spec.title;
}

export function postponed(session: Session, state: ChangeState): Output {
  const t = translator(session.lang);
  return {
    status: "ok",
    header: headerOf(state.id, state.phase),
    blocks: [{ lines: [t("Nada cambió.", "Nothing changed.")] }],
    next: t(
      `revisa \`${session.cards.command} status\` cuando quieras decidir.`,
      `check \`${session.cards.command} status\` when you want to decide.`,
    ),
  };
}
