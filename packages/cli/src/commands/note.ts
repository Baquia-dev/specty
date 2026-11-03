// SPDX-License-Identifier: Apache-2.0
import { notedCard, noteRefusalCard, type Output } from "@baquia-dev/specty-core";
import type { Command } from "commander";
import { auditEntry, isFinished, resolveActive, withChangeLock } from "../flow/active";
import type { Session } from "../session";
import { appendAudit } from "../store/changes";

type Run = (handler: (session: Session) => Promise<Output>) => () => Promise<void>;

/** Registers `specty note <text>`, with the change's lock: it writes the change's audit. */
export function noteCommand(program: Command, run: Run): void {
  program
    .command("note")
    .description("add a note to the change's log, for the session that resumes it")
    .argument("<text>")
    .action((text: string) =>
      run((session) => withChangeLock(session, "note", () => note(session, text)))(),
    );
}

/**
 * `specty note` (ADR 0016): the agent or the person adds a note to the log of this folder's open
 * change, a `change.noted` event of its audit; `next`'s card shows the last ones.
 */
async function note(session: Session, text: string): Promise<Output> {
  const written = text.trim();
  if (written.length === 0) return noteRefusalCard({ reason: "empty" }, session.cards);
  const active = await resolveActive(session);
  if (active === undefined || isFinished(active.state))
    return noteRefusalCard({ reason: "no-change" }, session.cards);
  const actor = session.actor === "human" ? "human" : "agent";
  await appendAudit(
    active.files,
    await auditEntry(session, actor, "change.noted", { text: written }),
  );
  return notedCard(active.state.id, written, session.cards);
}
