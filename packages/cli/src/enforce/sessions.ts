// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import {
  AGENT_CAPABILITIES,
  type BoundSession,
  type GuardAction,
  parseSpec,
} from "@baquia-dev/specty-core";
import { isFinished, resolveActive } from "../flow/active";
import { exists } from "../io/files";
import { resolved } from "../io/git";
import { type Environment, openSession, type Session } from "../session";
import { readSpec } from "../store/changes";
import { readBinding, type SessionBinding, writeBinding } from "../store/local";
import { conversationOf, type GuardTool } from "./actions";
import { namedWorktree } from "./worktree-hooks";

/** `EnterWorktree` as Claude Code sends it: a folder to enter, or a name for a new one. */
export interface EnterRequest {
  readonly path?: string;
  readonly name?: string;
}

type EnterAction = Extract<GuardAction, { readonly kind: "enter" }>;

/**
 * `EnterWorktree` as the guard judges it: the folder the session moves into and, when the session
 * is already bound to a worktree, that folder with its change while the change is still open.
 */
export async function enterAction(
  environment: Environment,
  session: Session,
  event: Record<string, unknown>,
  request: EnterRequest,
  cwd: string,
): Promise<GuardAction> {
  // By name, the hook `WorktreeCreate` picks the folder: the change's own, if it has one.
  const target =
    request.path !== undefined
      ? await resolved(resolve(cwd, request.path))
      : request.name !== undefined
        ? (await namedWorktree(session.git, request.name)).folder
        : undefined;
  return target === undefined
    ? { kind: "other" }
    : await enterInto(environment, session, event, target);
}

/**
 * `specty enter <id>` as the guard judges it: `EnterWorktree` by name for the other agents, only
 * into the folder `specty new` prepared for the change. Undefined without one: the command says so.
 */
export async function enterChange(
  environment: Environment,
  session: Session,
  event: Record<string, unknown>,
  id: string,
): Promise<EnterAction | undefined> {
  const named = await namedWorktree(session.git, id);
  return named.prepared ? await enterInto(environment, session, event, named.folder) : undefined;
}

async function enterInto(
  environment: Environment,
  session: Session,
  event: Record<string, unknown>,
  target: string,
): Promise<EnterAction> {
  const binding = await bindingOf(session, event);
  if (binding === undefined) return { kind: "enter", target };
  const bound = await boundTo(environment, binding.folder);
  const epic = (await openChange(environment, target))?.epic;
  return { kind: "enter", target, bound, ...(epic !== undefined ? { epic } : {}) };
}

/** Claude Code enters a change's folder with its own tool (`EnterWorktree`), not `specty enter`. */
export function entersOnItsOwn(tool: GuardTool): boolean {
  return AGENT_CAPABILITIES[tool].worktreeByName.state === "yes";
}

/**
 * The session of the change's folder the event's conversation entered with `specty enter`, and
 * that folder, whatever folder its tool works in; otherwise, `session` as it was. Claude Code
 * moves its whole session there itself, and goes on where it is after `ExitWorktree`.
 */
export async function enteredSession(
  tool: GuardTool,
  session: Session,
  event: Record<string, unknown>,
): Promise<{ readonly session: Session; readonly bound?: string }> {
  if (entersOnItsOwn(tool)) return { session };
  const binding = await bindingOf(session, event);
  const bound =
    binding !== undefined && (await exists(binding.folder)) ? binding.folder : undefined;
  if (bound === undefined) return { session };
  if (bound === session.root) return { session, bound };
  const opened = await openSession({ ...session.environment, cwd: bound });
  return opened.kind === "ok" ? { session: opened.session, bound } : { session };
}

async function bindingOf(
  session: Session,
  event: Record<string, unknown>,
): Promise<SessionBinding | undefined> {
  const id = conversationOf(event);
  return id === undefined ? undefined : await readBinding(session.git, id);
}

/** The session's folder, with its change only while that change is open there. */
async function boundTo(environment: Environment, folder: string): Promise<BoundSession> {
  const change = await openChange(environment, folder);
  return change === undefined ? { folder } : { folder, change: change.id };
}

/** The open change of `folder`, with the epic it is a slice of, if it is one. */
async function openChange(
  environment: Environment,
  folder: string,
): Promise<{ readonly id: string; readonly epic?: string } | undefined> {
  if (!(await exists(folder))) return undefined;
  const opened = await openSession({ ...environment, cwd: folder });
  if (opened.kind !== "ok") return undefined;
  const change = await resolveActive(opened.session);
  if (change === undefined || isFinished(change.state)) return undefined;
  const { epic } = parseSpec(await readSpec(change.files)).spec.frontmatter;
  return { id: change.state.id, ...(epic !== undefined ? { epic } : {}) };
}

/** Once the conversation may enter `target`, that worktree is the one it works in. */
export async function bindSession(
  session: Session,
  event: Record<string, unknown>,
  target: string,
): Promise<void> {
  const id = conversationOf(event);
  if (id === undefined) return;
  await writeBinding(session.git, id, {
    folder: target,
    at: session.environment.now().toISOString(),
  });
}
