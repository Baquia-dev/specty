// SPDX-License-Identifier: Apache-2.0
import {
  analyzeShell,
  decideGuard,
  type GuardContext,
  type GuardDecision,
  nativeEnterDenial,
  unreachableEnterDenial,
} from "@baquia-dev/specty-core";
import type { AgentAdapter } from "../agents/adapter";
import { worktreesHome } from "../flow/worktree";
import type { Environment, Session } from "../session";
import { outOfReach } from "./place";
import { enterChange, entersOnItsOwn } from "./sessions";

/** The event of an agent's tool before a shell command, in the session it works in. */
interface EnterCall {
  readonly agent: AgentAdapter;
  readonly environment: Environment;
  readonly session: Session;
  readonly event: Record<string, unknown>;
}

/**
 * A command with `specty enter <id>`: like `EnterWorktree` by name, the conversation enters that
 * change's folder if it may, and the rest of the command is judged as usual. Claude Code's session
 * is told to use its own tool; its subagents enter this way. Undefined without one, or for a change
 * without a folder: the command says so.
 */
export async function enterCommand(
  call: EnterCall,
  command: string,
  ctx: GuardContext,
): Promise<{ readonly decision: GuardDecision; readonly target?: string } | undefined> {
  const id = analyzeShell(command).enters.at(-1);
  if (id === undefined) return undefined;
  if (entersOnItsOwn(call.agent.tool, call.event)) {
    const { reason, next } = nativeEnterDenial(id, ctx.lang);
    return { decision: { allow: false, rule: "session", reason, next } };
  }
  const enter = await enterChange(call.environment, call.session, call.event, id);
  if (enter === undefined) return undefined;
  const away = await unreachable(call, id, enter.target, ctx);
  return away !== undefined
    ? { decision: away }
    : { decision: decideGuard(enter, ctx), target: enter.target };
}

/**
 * The denial for a change's folder outside every folder the tool lets its agent work in: entered,
 * the conversation could do nothing there, so it is not bound. Undefined when it is within reach,
 * or the tool does not say.
 */
async function unreachable(
  { agent, event, session }: EnterCall,
  id: string,
  folder: string,
  ctx: GuardContext,
): Promise<GuardDecision | undefined> {
  const workspace = agent.workspace?.(event);
  if (workspace === undefined || !(await outOfReach(folder, workspace))) return undefined;
  const home = await worktreesHome(session.git);
  const view = { id, folder, workspace, home, tool: agent.tool };
  const { reason, next } = unreachableEnterDenial(view, ctx.lang, ctx.command);
  return { allow: false, rule: "session", reason, next };
}
