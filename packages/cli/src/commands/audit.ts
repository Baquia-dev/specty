// SPDX-License-Identifier: Apache-2.0
import {
  type AuditEvent,
  type AuditView,
  auditRefusalCard,
  auditReport,
  type Output,
  parseSpec,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import type { ReportOutput } from "../check/provider";
import { resolveActive } from "../flow/active";
import { type Audit, readAudit } from "../flow/carried";
import { findChange } from "../flow/find";
import { taskCommits } from "../flow/views";
import { isRecord } from "../io/files";
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
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const commits = await taskCommits(session, state.id);
  const events = eventsOf(await readAudit(change.files));
  const request = events.find((entry) => entry.event === "change.created")?.data.request;
  const { approved } = state;
  const view: AuditView = {
    id: state.id,
    title: spec.title || state.id,
    kind: state.kind,
    phase: state.phase,
    ...(state.branch === undefined ? {} : { branch: state.branch }),
    ...(typeof request === "string" ? { request } : {}),
    ...(approved === undefined
      ? {}
      : {
          approved: {
            revision: approved.revision,
            at: approved.at,
            by: approved.by,
            channel: approved.channel,
          },
        }),
    tasks: (spec.sections.tasks?.items ?? []).map((task) => {
      const stored = state.tasks[task.id];
      const commit = commits.get(task.id);
      return {
        id: task.id,
        title: task.title,
        status: stored?.status ?? "pending",
        ...(commit === undefined ? {} : { commit }),
        ...(stored?.summary === undefined ? {} : { summary: stored.summary }),
      };
    }),
    events,
  };
  const { markdown, json } = auditReport(view, session.lang);
  return { report: markdown, json, code: 0 };
}

/** The audit's lines, as the report reads them; one that is not an event is left out. */
function eventsOf(audit: Audit): AuditEvent[] {
  return audit.flatMap((entry): AuditEvent[] => {
    const { ts, actor, tool, event, data } = entry;
    if (typeof ts !== "string" || typeof actor !== "string" || typeof event !== "string") return [];
    return [
      {
        ts,
        actor,
        ...(typeof tool === "string" ? { tool } : {}),
        event,
        data: isRecord(data) ? data : {},
      },
    ];
  });
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
