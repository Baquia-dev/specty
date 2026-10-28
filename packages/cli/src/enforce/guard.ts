// SPDX-License-Identifier: Apache-2.0
import {
  analyzeShell,
  decideAfterShell,
  decideGuard,
  type GuardAction,
  type GuardChange,
  type GuardContext,
  type GuardDecision,
  isIntegrating,
  nativeEnterDenial,
  parseSpec,
  renderText,
  shellChanges,
} from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import type { AgentAdapter, EventKind, Verdict } from "../agents/adapter";
import { next } from "../commands/next";
import { isFinished, resolveActive } from "../flow/active";
import { sharedFolders, worktreesHome } from "../flow/worktree";
import { isRecord, parseJson } from "../io/files";
import { COMMAND, type Environment, openSession, type Session } from "../session";
import { readSpec } from "../store/changes";
import { conversationOf, cwdOf, type GuardReply, type GuardTool, toolUseId } from "./actions";
import { leavePending, type PendingKind, takePending } from "./pending";
import { redirection, resolveAction } from "./place";
import { bindSession, enterAction, enterChange, enteredSession, entersOnItsOwn } from "./sessions";
import {
  pruneSnapshots,
  saveSnapshot,
  takeSnapshot,
  treeSnapshot,
  withoutSpecty,
} from "./shell-snapshot";
import { worktreeHook } from "./worktree-hooks";

const ALLOW: Verdict = { allow: true };

/** One event the guard answers: the agent's module, its event, its session and its folder. */
interface Call {
  readonly agent: AgentAdapter;
  readonly environment: Environment;
  readonly session: Session;
  readonly event: Record<string, unknown>;
  readonly cwd: string;
  /** The change's folder the conversation entered (`specty enter`): its session is that one. */
  readonly bound?: string;
  /** What the agent's module rewrote in the tool's input (`redirect`), sent back if it passes. */
  readonly input?: Readonly<Record<string, unknown>>;
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
  // Another tool runs these hooks as its own, and its own guard decides.
  if (agent.borrowed?.(environment.env) === true) return agent.reply(ALLOW, "before");
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
    // A conversation that entered a change's folder is answered in that folder's session.
    const entered = await enteredSession(agent.tool, opened.session, event);
    const call = { agent, environment, event, cwd, ...entered };
    return await answer(kind, kind === "before" ? await redirected(call, given) : call);
  } catch (error) {
    return agent.failed(`specty guard: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Before an action, the tool's input as the agent's module rewrites it so the action happens in
 * the conversation's folder (`redirect`): the rewritten action is the one judged, and the one
 * that runs if it goes through.
 */
async function redirected(call: Call, given: Record<string, unknown>): Promise<Call> {
  const input = call.agent.redirect?.(given, await redirection(call));
  if (input === undefined) return call;
  const moved = { ...given, tool_input: input };
  const event = call.agent.normalize?.(moved) ?? moved;
  return { ...call, event, cwd: cwdOf(event, call.environment.cwd), input };
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
async function beforeAction(call: Call): Promise<GuardReply> {
  const { agent, environment, session, event, cwd } = call;
  const raw = agent.action(event);
  const action =
    raw.kind === "enter"
      ? await enterAction(environment, session, event, raw.request, cwd)
      : await resolveAction(call, raw);
  const ctx = await guardContext(session);
  const entry = raw.kind === "shell" ? await enterCommand(call, raw.command, ctx) : undefined;
  const decision = entry?.decision.allow === false ? entry.decision : decideGuard(action, ctx);
  // One change at a time per conversation: the worktree it may enter becomes its own.
  const target = action.kind === "enter" ? action.target : entry?.target;
  if (decision.allow && target !== undefined) await bindSession(session, event, target);
  if (decision.allow) await beforeShell(session, event, action);
  return await replyBefore(call, decision, action);
}

/**
 * The reply before an action. What goes through brings the input the agent's module rewrote and,
 * for an agent with `grants`, Specty's folders: with a command, and with each action of a
 * conversation that entered a change's folder, which may also read the worktrees' folder.
 */
async function replyBefore(
  { agent, session, input, bound }: Call,
  decision: GuardDecision,
  action: GuardAction,
): Promise<GuardReply> {
  const said = verdict(decision, session);
  if (!said.allow) return agent.reply(said, "before");
  // A conversation that entered a change's folder works outside the tool's workspace.
  const entered = agent.grants === true && bound !== undefined;
  const grants = entered || (agent.grants === true && action.kind === "shell");
  return agent.reply(
    {
      ...said,
      ...(input === undefined ? {} : { input }),
      ...(grants ? { folders: await sharedFolders(session.git) } : {}),
      ...(entered ? { readable: [await worktreesHome(session.git)] } : {}),
    },
    "before",
  );
}

/**
 * A command with `specty enter <id>`: like `EnterWorktree` by name, the conversation enters that
 * change's folder if it may, and the rest of the command is judged as usual. Claude Code is told
 * to use its own tool. Undefined without one, or for a change without a folder: the command says so.
 */
async function enterCommand(
  call: Call,
  command: string,
  ctx: GuardContext,
): Promise<{ readonly decision: GuardDecision; readonly target?: string } | undefined> {
  const id = analyzeShell(command).enters.at(-1);
  if (id === undefined) return undefined;
  if (entersOnItsOwn(call.agent.tool)) {
    const { reason, next } = nativeEnterDenial(id, ctx.lang);
    return { decision: { allow: false, rule: "session", reason, next } };
  }
  const enter = await enterChange(call.environment, call.session, call.event, id);
  return enter === undefined
    ? undefined
    : { decision: decideGuard(enter, ctx), target: enter.target };
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
  const changes = await withoutSpecty(session, shellChanges(before, await treeSnapshot(session)));
  return verdict(decideAfterShell(changes, await guardContext(session)), session);
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
  const testing = state.phase === "testing";
  const spec =
    taskEntry === undefined && !testing
      ? undefined
      : parseSpec(await readSpec(active.files), { language: session.lang }).spec;
  const files = spec?.sections.tasks?.items.find((task) => task.id === taskEntry?.[0])?.files ?? [];
  // In the testing phase, the tests of any of the change's files may be written (ADR 0014).
  const planned = [
    ...(spec?.sections.files?.items ?? []).map((entry) => entry.path),
    ...(spec?.sections.tasks?.items ?? []).flatMap((task) => task.files),
  ];
  const change: GuardChange = {
    id: state.id,
    kind: state.kind,
    phase: state.phase,
    closingSubmitted: state.closingSubmittedAt !== undefined,
    specPath: session.paths.relative(active.files.spec),
    ...(taskEntry !== undefined
      ? { task: { id: taskEntry[0], files, extras: taskEntry[1].scopeExtra } }
      : {}),
    ...(testing ? { files: planned } : {}),
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
