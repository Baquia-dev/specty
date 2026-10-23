// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import {
  analyzeShell,
  decideAfterShell,
  decideGuard,
  type ForeignPath,
  type GuardAction,
  type GuardChange,
  type GuardDecision,
  isGoverned,
  isIntegrating,
  parseSpec,
  shellChanges,
} from "@baquia-dev/specty-core";
import { isFinished, resolveActive } from "../flow/active";
import { placePaths } from "../flow/worktree";
import { isRecord, parseJson } from "../io/files";
import { pathsOf } from "../io/git";
import { COMMAND, type Environment, openSession, type Session } from "../session";
import { readSpec } from "../store/changes";
import { checksAfterShell, type GuardTool, type RawAction, toolAction } from "./actions";
import { bindSession, enterAction } from "./sessions";
import { pruneSnapshots, saveSnapshot, takeSnapshot, treeSnapshot } from "./shell-snapshot";

export interface GuardReply {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * `specty guard --tool <id>`: called by the agent's hooks before each action and, in Claude
 * Code and Codex, after each Bash command. It fails open on its own errors (the git hooks and
 * CI still apply) and never blocks outside Specty repos.
 */
export async function guard(
  environment: Environment,
  tool: GuardTool,
  stdin: string,
): Promise<GuardReply> {
  try {
    const event = parseJson(stdin);
    if (!isRecord(event)) return allow(tool);
    const cwd = cwdOf(event, environment.cwd);
    const opened = await openSession({ ...environment, cwd });
    if (opened.kind !== "ok") return allow(tool);
    const session = opened.session;
    const after = checksAfterShell(tool);
    if (after && isAfterTool(event)) return await afterShell(session, tool, event);
    const raw = toolAction(tool, event);
    const action =
      raw.kind === "enter"
        ? await enterAction(environment, session, event, raw.request, cwd)
        : await resolveAction(session, raw, cwd);
    const decision = decideGuard(action, await guardContext(session));
    // One change at a time per session: the worktree it may enter becomes its own.
    if (decision.allow && action.kind === "enter") await bindSession(session, event, action.target);
    if (decision.allow && after) await beforeShell(session, event, action);
    return reply(tool, decision, session);
  } catch (error) {
    const message = `specty guard: ${error instanceof Error ? error.message : String(error)}`;
    return tool === "cursor"
      ? {
          code: 0,
          stdout: JSON.stringify({ permission: "allow", user_message: message }),
          stderr: "",
        }
      : { code: 1, stdout: "", stderr: message };
  }
}

function isAfterTool(event: Record<string, unknown>): boolean {
  return event.hook_event_name === "PostToolUse" || event.hook_event_name === "PostToolUseFailure";
}

/** The tool call that links the hooks before and after a command, safe as a file name. */
function toolUseId(event: Record<string, unknown>): string | undefined {
  const id = event.tool_use_id;
  return typeof id === "string" && /^[\w-]{1,128}$/.test(id) ? id : undefined;
}

/** Before a Bash command it lets through, keeps a snapshot of the tree to compare afterwards. */
async function beforeShell(
  session: Session,
  event: Record<string, unknown>,
  action: GuardAction,
): Promise<void> {
  const id = toolUseId(event);
  // Specty's own commands write its state and make its commits as part of the flow.
  if (action.kind !== "shell" || action.facts.specty.length > 0 || id === undefined) return;
  try {
    // Without the hook after the command (an install older than it), nobody reads snapshots.
    await pruneSnapshots(session);
    await saveSnapshot(session, id, await treeSnapshot(session));
  } catch {
    // Without a snapshot the check after the command stays silent.
  }
}

/** After a Bash command, judges what it changed with the guard's own rules. */
async function afterShell(
  session: Session,
  tool: GuardTool,
  event: Record<string, unknown>,
): Promise<GuardReply> {
  const id = toolUseId(event);
  const before = id === undefined ? undefined : await takeSnapshot(session, id);
  await pruneSnapshots(session);
  if (before === undefined) return allow(tool);
  const changes = shellChanges(before, await treeSnapshot(session));
  return reply(tool, decideAfterShell(changes, await guardContext(session)), session);
}

function cwdOf(event: Record<string, unknown>, fallback: string): string {
  if (typeof event.cwd === "string" && event.cwd.length > 0) return event.cwd;
  const roots = event.workspace_roots;
  return Array.isArray(roots) && typeof roots[0] === "string" ? roots[0] : fallback;
}

/**
 * Turns tool paths into repository-relative ones, and keeps apart those inside another worktree:
 * they belong to another change. Paths outside every worktree and paths git ignores
 * (`node_modules/`, caches, builds) are not governed code, so they are dropped.
 */
async function inRepo(
  session: Session,
  cwd: string,
  paths: readonly string[],
): Promise<{ readonly inside: string[]; readonly foreign: readonly ForeignPath[] }> {
  const placed = await placePaths(
    session.git,
    paths.map((path) => resolve(cwd, path)),
  );
  // The root itself (`rm -rf .`) is never ignored, and git rejects an empty pathspec.
  const ignored = new Set(await session.git.ignored(placed.inside.filter((path) => path !== "")));
  return { inside: placed.inside.filter((path) => !ignored.has(path)), foreign: placed.foreign };
}

async function resolveAction(
  session: Session,
  raw: Exclude<RawAction, { readonly kind: "enter" }>,
  cwd: string,
): Promise<GuardAction> {
  if (raw.kind === "other") return raw;
  if (raw.kind === "files") return { kind: "files", ...(await placeFiles(session, cwd, raw)) };
  if (raw.kind !== "shell") {
    const { inside, foreign } = await inRepo(session, cwd, raw.paths);
    return { kind: raw.kind, paths: inside, foreign };
  }
  // Paths the analysis cannot place (shell variables, `cd` to an unknown place) are not judged.
  const analysis = analyzeShell(raw.command);
  const committedGoverned =
    analysis.commits.length === 0
      ? []
      : pathsOf([
          ...(await session.git.staged()),
          ...(await session.git.changedSince(await session.git.head())),
        ]).filter((path) => !path.startsWith(".specty/") && isGoverned(path, session.config));
  return {
    kind: "shell",
    facts: {
      specty: analysis.specty,
      unscopedNpx: analysis.unscopedNpx,
      bypass: analysis.bypass,
      committedGoverned,
      ...(await placeFiles(session, cwd, analysis)),
    },
  };
}

/** What a command or a patch writes and deletes here, and apart, what it would change elsewhere. */
async function placeFiles(
  session: Session,
  cwd: string,
  files: { readonly writes: readonly string[]; readonly deletes: readonly string[] },
) {
  const writes = await inRepo(session, cwd, files.writes);
  const deletes = await inRepo(session, cwd, files.deletes);
  return {
    writes: writes.inside,
    deletes: deletes.inside,
    foreign: [...writes.foreign, ...deletes.foreign],
  };
}

async function guardContext(session: Session) {
  const active = await resolveActive(session);
  const base = {
    config: session.config,
    lang: session.lang,
    command: COMMAND,
    delegated: session.delegated,
  };
  if (active === undefined || isFinished(active.state)) return base;
  const { state } = active;
  const taskEntry = Object.entries(state.tasks).find(([, task]) => task.status === "active");
  const spec =
    taskEntry === undefined
      ? undefined
      : parseSpec(await readSpec(active.files), { language: session.lang }).spec;
  const files = spec?.sections.tasks?.items.find((task) => task.id === taskEntry?.[0])?.files ?? [];
  const change: GuardChange = {
    id: state.id,
    kind: state.kind,
    phase: state.phase,
    closingSubmitted: state.closingSubmittedAt !== undefined,
    specPath: session.paths.relative(active.files.spec),
    ...(taskEntry !== undefined
      ? { task: { id: taskEntry[0], files, extras: taskEntry[1].scopeExtra } }
      : {}),
    ...(state.integration !== undefined && isIntegrating(state)
      ? { integration: { target: state.integration.target, paths: state.integration.paths } }
      : {}),
  };
  return { ...base, change };
}

function reply(tool: GuardTool, decision: GuardDecision, session: Session): GuardReply {
  if (decision.allow) return allow(tool);
  const label = session.lang === "es" ? "SIGUIENTE" : "NEXT";
  const text = `specty: ${decision.reason}\n${label}: ${decision.next}`;
  if (tool === "cursor") {
    return {
      code: 0,
      stdout: JSON.stringify({
        permission: "deny",
        user_message: `specty: ${decision.reason}`,
        agent_message: text,
      }),
      stderr: "",
    };
  }
  return { code: 2, stdout: "", stderr: text };
}

function allow(tool: GuardTool): GuardReply {
  return tool === "cursor"
    ? { code: 0, stdout: JSON.stringify({ permission: "allow" }), stderr: "" }
    : { code: 0, stdout: "", stderr: "" };
}
