// SPDX-License-Identifier: Apache-2.0
import {
  auditRefusalCard,
  auditReport,
  auditViewOf,
  type Output,
  parseSpec,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import type { ReportOutput } from "../check/provider";
import { resolveActive } from "../flow/active";
import { readAudit } from "../flow/carried";
import { findChange } from "../flow/find";
import { taskCommits } from "../flow/views";
import type { Session } from "../session";
import { readSpec } from "../store/changes";

/**
 * `specty audit [<id>]` (ARCHITECTURE §13): the report of a change, the active one by default,
 * from its files, its audit and git. It only reads, so the agent may run it too.
 */
async function audit(session: Session, id: string | undefined): Promise<Output | ReportOutput> {
  const change = id === undefined ? await resolveActive(session) : await findChange(session, id);
  if (change === undefined) {
    return auditRefusalCard(
      id === undefined ? { reason: "no-active" } : { reason: "no-change", id },
      session.cards,
    );
  }
  const { state } = change;
  const view = auditViewOf({
    state,
    spec: parseSpec(await readSpec(change.files), { language: session.lang }).spec,
    audit: await readAudit(change.files),
    commits: await taskCommits(session, state.id),
  });
  const { markdown, json } = auditReport(view, session.lang);
  return { report: markdown, json, code: 0 };
}

/** Registers `specty audit`; `run` opens the session as for every command. */
export function auditCommand(
  program: Command,
  run: (handler: (session: Session) => Promise<Output | ReportOutput>) => () => Promise<void>,
): void {
  program
    .command("audit [id]")
    .description("the report of a change, the active one by default: its tasks and its timeline")
    .action((id: string | undefined) => run((session) => audit(session, id))());
}
