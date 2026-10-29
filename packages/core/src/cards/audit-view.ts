// SPDX-License-Identifier: Apache-2.0
import type { ChangeState } from "../schema/state";
import type { Spec } from "../spec/model";
import type { AuditEvent, AuditView } from "./audit";

/** What the audit report reads of a change (ARCHITECTURE §13). */
export interface AuditSource {
  readonly state: ChangeState;
  readonly spec: Spec;
  /** The lines of `audit.jsonl` (formats.md §4), oldest first, as JSON read them. */
  readonly audit: readonly unknown[];
  /**
   * The commit of each task, by its id: the CLI finds them through their trailers. Without them,
   * those in `state.tasks`, where the local server puts them.
   */
  readonly commits?: ReadonlyMap<string, string>;
}

/**
 * The change as `specty audit` reports it, from its files, its audit and its commits: the CLI and
 * the UI's export build the same report.
 */
export function auditViewOf({ state, spec, audit, commits }: AuditSource): AuditView {
  const events = eventsOf(audit);
  const request = events.find((entry) => entry.event === "change.created")?.data.request;
  const { approved } = state;
  return {
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
      const commit = commits === undefined ? stored?.commit : commits.get(task.id);
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
}

/** The audit's lines, as the report reads them; one that is not an event is left out. */
function eventsOf(audit: readonly unknown[]): AuditEvent[] {
  return audit.flatMap((entry): AuditEvent[] => {
    if (!isRecord(entry)) return [];
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
