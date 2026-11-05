// SPDX-License-Identifier: Apache-2.0
import { basename, resolve } from "node:path";
import {
  AGENT_CAPABILITIES,
  type BoundSession,
  type GuardAction,
  parseSpec,
  type ResolvedConfig,
} from "@baquia-dev/specty-core";
import { isFinished, resolveActive } from "../flow/active";
import { lostChanges } from "../flow/lost";
import { exists } from "../io/files";
import { type Git, resolved } from "../io/git";
import { type Environment, type Opened, openSession, type Session } from "../session";
import { readSpec } from "../store/changes";
import { loadConfig } from "../store/config";
import { readBinding, type SessionBinding, writeBinding } from "../store/local";
import { repoPaths } from "../store/paths";
import { conversationOf, type GuardTool, subagentOf } from "./actions";
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

/**
 * Whether the event's conversation enters a change's folder with its tool's own means: Claude
 * Code's session does, with `EnterWorktree`. Its subagents start where the session works and keep
 * no `cd`, so they enter with `specty enter`, as the other agents do.
 */
export function entersOnItsOwn(tool: GuardTool, event: Record<string, unknown>): boolean {
  return AGENT_CAPABILITIES[tool].worktreeByName.state === "yes" && subagentOf(event) === undefined;
}

/**
 * The session that answers the event, with the event's conversation (`Session.conversation`), so
 * that the cards it brings, like `next`'s, know who asks.
 */
export async function enteredSession(
  tool: GuardTool,
  session: Session,
  event: Record<string, unknown>,
): Promise<{ readonly session: Session; readonly bound?: string }> {
  const entered = await enteredFolder(tool, session, event);
  const id = conversationOf(event);
  if (id === undefined) return entered;
  return { ...entered, session: { ...entered.session, conversation: { tool, id } } };
}

/**
 * The session of the change's folder the event's conversation entered with `specty enter`, and
 * that folder, whatever folder its tool works in; otherwise, `session` as it was. Claude Code
 * moves its whole session there itself, and goes on where it is after `ExitWorktree`; its
 * subagents enter with `specty enter`.
 */
async function enteredFolder(
  tool: GuardTool,
  session: Session,
  event: Record<string, unknown>,
): Promise<{ readonly session: Session; readonly bound?: string }> {
  if (entersOnItsOwn(tool, event)) return { session };
  const binding = await bindingOf(session, event);
  const bound =
    binding !== undefined && (await exists(binding.folder)) ? binding.folder : undefined;
  if (bound === undefined) return { session };
  if (bound === session.root) return { session, bound };
  // A folder whose configuration broke is still the conversation's: judged with its tool's (P154).
  const opened = await openSession(
    { ...session.environment, cwd: bound },
    async () => session.config,
  );
  return opened.kind === "ok" ? { session: opened.session, bound } : { session };
}

/**
 * The session of the folder its tool works in, as the guard judges it: a change's folder whose
 * configuration is not valid opens with the main folder's, so the guard still judges its change
 * and keeps its `.specty/config.yaml` protected (P154).
 */
export async function guardSession(environment: Environment, cwd: string): Promise<Opened> {
  return await openSession({ ...environment, cwd }, mainConfig);
}

/** The configuration of the repository's main folder, its first worktree, if it is valid. */
async function mainConfig(git: Git): Promise<ResolvedConfig | undefined> {
  const main = (await git.worktrees())[0]?.folder ?? git.root;
  const loaded = await loadConfig(repoPaths(main));
  return loaded.kind === "ok" ? loaded.config : undefined;
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

/** The open change of `folder`, with its title and the epic it is a slice of, if it is one. */
async function openChange(
  environment: Environment,
  folder: string,
): Promise<{ readonly id: string; readonly title: string; readonly epic?: string } | undefined> {
  if (!(await exists(folder))) return undefined;
  const opened = await openSession({ ...environment, cwd: folder });
  if (opened.kind !== "ok") return undefined;
  const change = await resolveActive(opened.session);
  if (change === undefined || isFinished(change.state)) return undefined;
  const { spec } = parseSpec(await readSpec(change.files));
  const { epic } = spec.frontmatter;
  return { id: change.state.id, title: spec.title, ...(epic !== undefined ? { epic } : {}) };
}

/**
 * The open change of the folder the session's conversation is bound to, when that folder is not
 * the one the session works in: the conversation left it, and `next` tells it to go back.
 */
export async function conversationChange(session: Session): Promise<
  | {
      readonly id: string;
      readonly title: string;
      readonly folder: string;
      readonly lost?: boolean;
    }
  | undefined
> {
  const id = session.conversation?.id;
  const binding = id === undefined ? undefined : await readBinding(session.git, id);
  if (binding === undefined) return undefined;
  const { folder } = binding;
  if ((await resolved(folder)) === (await resolved(session.root))) return undefined;
  const change = await openChange(session.environment, folder);
  if (change !== undefined) return { id: change.id, title: change.title, folder };
  if (await exists(folder)) return undefined;
  // A folder that is gone and was a lost change's: git still lists it, or it bears the change's id.
  const lost = (await lostChanges(session)).find(
    (candidate) => candidate.stale.includes(folder) || candidate.id === basename(folder),
  );
  return lost === undefined ? undefined : { id: lost.id, title: lost.title, folder, lost: true };
}

/**
 * `specty new` binds the conversation that runs it to the new change's folder, as entering that
 * folder would: unless it is bound to another open change, other than the new change's epic
 * (the guard's `sessionDenial`).
 */
export async function bindNew(
  session: Session,
  folder: string,
  epic: string | undefined,
): Promise<void> {
  const id = session.conversation?.id;
  if (id === undefined) return;
  const binding = await readBinding(session.git, id);
  const bound =
    binding === undefined ? undefined : await boundTo(session.environment, binding.folder);
  if (bound?.change !== undefined && bound.folder !== folder && bound.change !== epic) return;
  await writeBinding(session.git, id, { folder, at: session.environment.now().toISOString() });
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
