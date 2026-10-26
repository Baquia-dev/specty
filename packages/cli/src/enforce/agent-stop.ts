// SPDX-License-Identifier: Apache-2.0
import { translator } from "@baquia-dev/specty-core";
import { check } from "../commands/check";
import { resolveActive } from "../flow/active";
import { isRecord, parseJson } from "../io/files";
import type { Session } from "../session";

/**
 * `specty hook agent-stop <agent>` (ADR 0012): when the agent ends its turn, `specty check
 * --changed` runs, with the plan's checks while a change is approved; if it fails, the agent gets
 * the report back and goes on, in the form its documentation gives. Claude Code and Codex read
 * `{ decision: "block", reason }` from their `Stop` event; Cursor sends `followup_message` from
 * its `stop` event as the next message. Nothing is printed when there is nothing to fix.
 */

/** The phases whose change has an approved plan the diff must keep to. */
const APPROVED_PHASES: ReadonlySet<string> = new Set([
  "implementing",
  "adjusting",
  "acceptance",
  "closing",
]);

/** What to print for the agent: its reply, or nothing to let the turn end. */
export async function agentStop(session: Session, tool: string, input: string): Promise<string> {
  const event = parseJson(input);
  if (!acts(tool, isRecord(event) ? event : {})) return "";
  const active = await resolveActive(session);
  const planned = active !== undefined && APPROVED_PHASES.has(active.state.phase);
  const result = await check(
    session,
    "changed",
    false,
    planned ? { id: active.state.id } : undefined,
  );
  if (result.code === 0) return "";
  const t = translator(session.lang);
  const message = `${t(
    "`specty check --changed` falla; corrígelo antes de terminar el turno:",
    "`specty check --changed` fails; fix it before ending the turn:",
  )}\n${result.report}`;
  return tool === "cursor"
    ? JSON.stringify({ followup_message: message })
    : JSON.stringify({ decision: "block", reason: message });
}

/**
 * Whether this end of turn is one to check. Claude Code and Codex mark with `stop_hook_active`
 * a turn the hook already sent back, which may end now so that it never loops; Cursor has its
 * own `loop_limit`, and only a completed turn counts.
 */
function acts(tool: string, event: Readonly<Record<string, unknown>>): boolean {
  if (tool === "cursor") return event.status === "completed";
  if (tool === "claude-code" || tool === "codex") return event.stop_hook_active !== true;
  return false;
}
