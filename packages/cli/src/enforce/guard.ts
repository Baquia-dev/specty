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
  renderText,
  type ShellAnalysis,
  shellChanges,
} from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import type { AgentAdapter, EventKind, Verdict } from "../agents/adapter";
import { next } from "../commands/next";
import { isFinished, resolveActive } from "../flow/active";
import { placePaths } from "../flow/worktree";
import { isRecord, parseJson } from "../io/files";
import { pathsOf } from "../io/git";
import { COMMAND, type Environment, openSession, type Session } from "../session";
import { readSpec } from "../store/changes";
import {
  conversationOf,
  cwdOf,
  type GuardReply,
  type GuardTool,
  type RawAction,
  toolUseId,
} from "./actions";
import { leavePending, type PendingKind, takePending } from "./pending";
import { bindSession, enterAction } from "./sessions";
import { pruneSnapshots, saveSnapshot, takeSnapshot, treeSnapshot } from "./shell-snapshot";
import { worktreeHook } from "./worktree-hooks";

const ALLOW: Verdict = { allow: true };

/** One event the guard answers: the agent's module, its event, its session and its folder. */
interface Call {
  readonly agent: AgentAdapter;
  readonly environment: Environment;
  readonly session: Session;
  readonly event: Record<string, unknown>;
  readonly cwd: string;
}

/**
 * `specty guard --tool <id>`: called by the agent's hooks before each action and after each shell
 * command; in Claude Code, also to create and remove worktrees
 * and, after a compaction, to bring back what `specty next` says.
 * It reads and answers each agent through its module (`agents/`); a tool whose input does not
 * name its event gets it from the hook's command (`--event`).
 * It fails open on its own errors (the git hooks and CI still apply) and never blocks outside
 * Specty repos.
 */
export async function guard(
  environment: Environment,
  tool: GuardTool,
  stdin: string,
  named?: string,
): Promise<GuardReply> {
  const agent = ADAPTERS[tool];
  try {
    const parsed = parseJson(stdin);
    if (!isRecord(parsed)) return agent.reply(ALLOW, "before");
    const given =
      named === undefined || "hook_event_name" in parsed
        ? parsed
        : { ...parsed, hook_event_name: named };
    const event = agent.normalize?.(given) ?? given;
    const cwd = cwdOf(event, environment.cwd);
    const kind = agent.kind(event);
    // They make and remove worktrees for Claude Code, so they answer even outside a session.
    if (kind === "worktree") return await worktreeHook(environment, event, cwd);
    const opened = await openSession({ ...environment, cwd });
    if (opened.kind !== "ok") return agent.reply(ALLOW, kind === "before" ? "before" : "after");
    return await answer(kind, { agent, environment, session: opened.session, event, cwd });
  } catch (error) {
    return agent.failed(`specty guard: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The answer to an event of a Specty session, by what the event is. */
async function answer(kind: EventKind, call: Call): Promise<GuardReply> {
  const { agent, session, event } = call;
  switch (kind) {
    // After a compaction the agent adds this to the context, so the task card comes back.
    case "compact":
      return agent.card === undefined
        ? agent.reply(ALLOW, "after")
        : agent.card(renderText(await next(session), session.lang));
    // A tool that cannot add it now gets it with the conversation's next command.
    case "compacting":
      await leave(session, event, "card", "");
      return agent.reply(ALLOW, "after");
    case "after": {
      const said = await afterShell(session, event);
      const card = await pendingCard(session, event);
      if (agent.late === undefined || said.allow) return agent.reply(said, "after", card);
      // A tool whose hook after a command cannot reach the model gets it with its next call.
      await leave(session, event, "warning", said.text);
      return agent.reply(ALLOW, "after", card);
    }
    case "invocation":
    case "turn":
      return await modelCall(kind, call);
    default:
      return await beforeAction(call);
  }
}

/**
 * Before a model call, what waited for it: the warning a command left, and at the first call of
 * a turn the task card, which no compaction of a tool that does not say when it compacts can cut.
 */
async function modelCall(
  kind: "invocation" | "turn",
  { agent, session, event }: Call,
): Promise<GuardReply> {
  const conversation = conversationOf(event);
  const warning =
    conversation === undefined ? undefined : await takePending(session, conversation, "warning");
  const card = kind === "turn" ? [renderText(await next(session), session.lang)] : [];
  const texts = [...card, ...(warning === undefined ? [] : [warning])];
  return agent.inject?.(texts) ?? agent.reply(ALLOW, "after");
}

/** Leaves something for the event's conversation to take with its next event that can carry it. */
async function leave(
  session: Session,
  event: Record<string, unknown>,
  kind: PendingKind,
  text: string,
): Promise<void> {
  const conversation = conversationOf(event);
  if (conversation !== undefined) await leavePending(session, conversation, kind, text);
}

/** Before an action: what it would do, judged by the flow's rules. */
async function beforeAction({
  agent,
  environment,
  session,
  event,
  cwd,
}: Call): Promise<GuardReply> {
  const raw = agent.action(event);
  const action =
    raw.kind === "enter"
      ? await enterAction(environment, session, event, raw.request, cwd)
      : await resolveAction(session, raw, cwd);
  const decision = decideGuard(action, await guardContext(session));
  // One change at a time per session: the worktree it may enter becomes its own.
  if (decision.allow && action.kind === "enter") await bindSession(session, event, action.target);
  if (decision.allow) await beforeShell(session, event, action);
  return agent.reply(verdict(decision, session), "before");
}

/** Before a shell command it lets through, keeps a snapshot of the tree to compare afterwards. */
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

/** The card a compaction left for the conversation's next command; undefined without one. */
async function pendingCard(
  session: Session,
  event: Record<string, unknown>,
): Promise<string | undefined> {
  const conversation = conversationOf(event);
  if (conversation === undefined) return undefined;
  if ((await takePending(session, conversation, "card")) === undefined) return undefined;
  return renderText(await next(session), session.lang);
}

/** After a shell command, judges what it changed with the guard's own rules. */
async function afterShell(session: Session, event: Record<string, unknown>): Promise<Verdict> {
  const id = toolUseId(event);
  const before = id === undefined ? undefined : await takeSnapshot(session, id);
  await pruneSnapshots(session);
  if (before === undefined) return ALLOW;
  const changes = shellChanges(before, await treeSnapshot(session));
  return verdict(decideAfterShell(changes, await guardContext(session)), session);
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
  const committedGoverned = (await commitsHere(session, cwd, analysis.commits))
    ? pathsOf([
        ...(await session.git.staged()),
        ...(await session.git.changedSince(await session.git.head())),
      ]).filter((path) => !path.startsWith(".specty/") && isGoverned(path, session.config))
    : [];
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

/**
 * Whether a commit of the command is this repository's: one whose folder the analysis cannot
 * name, or one inside any of its worktrees. A folder outside them all is another repository,
 * even if it does not exist yet (`cd /tmp/x && git init && git commit`).
 */
async function commitsHere(
  session: Session,
  cwd: string,
  commits: ShellAnalysis["commits"],
): Promise<boolean> {
  if (commits.some((commit) => commit.directory === undefined)) return true;
  const placed = await placePaths(
    session.git,
    commits.map((commit) => resolve(cwd, commit.directory ?? "")),
  );
  return placed.inside.length > 0 || placed.foreign.length > 0;
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

/** The decision as each agent's module answers it, with the reason and the next step. */
function verdict(decision: GuardDecision, session: Session): Verdict {
  if (decision.allow) return ALLOW;
  const label = session.lang === "es" ? "SIGUIENTE" : "NEXT";
  const text = `specty: ${decision.reason}\n${label}: ${decision.next}`;
  return { allow: false, reason: decision.reason, text };
}
