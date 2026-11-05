// SPDX-License-Identifier: Apache-2.0
import { basename, resolve } from "node:path";
import {
  analyzeShell,
  type GuardContext,
  type GuardDecision,
  subagentEnterDenial,
  subagentNewDenial,
} from "@baquia-dev/specty-core";
import { type Git, resolved } from "../io/git";
import type { Session } from "../session";
import { type RawAction, subagentOf } from "./actions";
import type { EnterRequest } from "./sessions";
import { namedWorktree } from "./worktree-hooks";

/** The event of an agent's tool before an action, in the session it works in. */
interface SubagentCall {
  readonly session: Session;
  readonly event: Record<string, unknown>;
  /** The folder the event happens in. */
  readonly cwd: string;
}

/**
 * What the guard asks of a subagent before judging its action, so that it neither moves nor binds
 * the session that launched it (ARCHITECTURE §10): to enter a change's folder with `specty enter`
 * instead of `EnterWorktree`, and to create a change with `specty new --subagent`. Undefined for
 * an event of the main conversation, and for any other action.
 */
export async function subagentDenial(
  { session, event, cwd }: SubagentCall,
  raw: RawAction,
  ctx: GuardContext,
): Promise<GuardDecision | undefined> {
  if (subagentOf(event) === undefined) return undefined;
  const denial =
    raw.kind === "enter"
      ? subagentEnterDenial(await namedChange(session.git, raw.request, cwd), ctx.lang, ctx.command)
      : raw.kind === "shell" && analyzeShell(raw.command).news.some((call) => !call.subagent)
        ? subagentNewDenial(ctx.lang, ctx.command)
        : undefined;
  return denial === undefined ? undefined : { allow: false, rule: "session", ...denial };
}

/**
 * The change `EnterWorktree` names: its `name`, or the change whose folder, the one `specty new`
 * prepared, its `path` is. Undefined when it names none.
 */
async function namedChange(
  git: Git,
  request: EnterRequest,
  cwd: string,
): Promise<string | undefined> {
  if (request.name !== undefined && request.name !== "") return request.name;
  if (request.path === undefined) return undefined;
  const folder = await resolved(resolve(cwd, request.path));
  const named = await namedWorktree(git, basename(folder));
  return named.prepared && (await resolved(named.folder)) === folder ? basename(folder) : undefined;
}
