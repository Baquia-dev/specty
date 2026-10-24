// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import { type BoundSession, type GuardAction, parseSpec } from "@baquia-dev/specty-core";
import { isFinished, resolveActive } from "../flow/active";
import { exists } from "../io/files";
import { resolved } from "../io/git";
import { type Environment, openSession, type Session } from "../session";
import { readSpec } from "../store/changes";
import { readBinding, writeBinding } from "../store/local";
import { namedWorktree } from "./worktree-hooks";

/** `EnterWorktree` as Claude Code sends it: a folder to enter, or a name for a new one. */
export interface EnterRequest {
  readonly path?: string;
  readonly name?: string;
}

/** The agent session of a Claude Code event, safe as a file name. */
export function sessionOf(event: Record<string, unknown>): string | undefined {
  const id = event.session_id;
  return typeof id === "string" && /^[\w-]{1,128}$/.test(id) ? id : undefined;
}

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
  if (target === undefined) return { kind: "other" };
  const id = sessionOf(event);
  const binding = id === undefined ? undefined : await readBinding(session.git, id);
  if (binding === undefined) return { kind: "enter", target };
  const bound = await boundTo(environment, binding.folder);
  const epic = (await openChange(environment, target))?.epic;
  return { kind: "enter", target, bound, ...(epic !== undefined ? { epic } : {}) };
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

/** Once the session may enter `target`, that worktree is the one it works in. */
export async function bindSession(
  session: Session,
  event: Record<string, unknown>,
  target: string,
): Promise<void> {
  const id = sessionOf(event);
  if (id === undefined) return;
  await writeBinding(session.git, id, {
    folder: target,
    at: session.environment.now().toISOString(),
  });
}
