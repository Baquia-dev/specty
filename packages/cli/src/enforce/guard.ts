// SPDX-License-Identifier: Apache-2.0
import {
  type ChangeState,
  DELETED,
  decideAfterShell,
  decideGuard,
  type GuardAction,
  type GuardChange,
  type GuardDecision,
  isIntegrating,
  parseSpec,
  renderText,
  type Spec,
  shellChanges,
} from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import type { AgentAdapter, EventKind, Verdict } from "../agents/adapter";
import { waitingMessages } from "../commands/message";
import { next } from "../commands/next";
import { isFinished, resolveActive } from "../flow/active";
import { gitCommonFolder } from "../flow/worktree";
import { isRecord, parseJson, remove } from "../io/files";
import { COMMAND, type Environment, type Session } from "../session";
import { noteActivity } from "../store/activity";
import { readSpec, type StoredChange } from "../store/changes";
import { conversationOf, cwdOf, type GuardReply, type GuardTool, toolUseId } from "./actions";
import { enterCommand } from "./enter-command";
import { endConversation, judgeFronts } from "./fronts";
import { leavePending, type PendingKind, takePending } from "./pending";
import { redirection, resolveAction } from "./place";
import { bindSession, enterAction, enteredSession, guardSession } from "./sessions";
import {
  DELEGATION_KEY,
  pruneSnapshots,
  saveSnapshot,
  takeSnapshot,
  treeSnapshot,
  withoutSpecty,
} from "./shell-snapshot";
import { subagentDenial } from "./subagents";
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
    const { given, event } = eventOf(agent, parsed, named);
    const cwd = cwdOf(event, environment.cwd);
    const kind = agent.kind(event);
    // They make and remove worktrees for Claude Code, so they answer even outside a session.
    if (kind === "worktree") return await worktreeHook(environment, event, cwd);
    const opened = await guardSession(environment, cwd);
    if (opened.kind !== "ok") return agent.reply(ALLOW, kind === "before" ? "before" : "after");
    // A conversation that entered a change's folder is answered in that folder's session.
    const entered = await enteredSession(agent.tool, opened.session, event);
    await noted(kind, agent.tool, entered.session, event);
    const call = { agent, environment, event, cwd, ...entered };
    return await answer(kind, kind === "before" ? await redirected(call, given) : call);
  } catch (error) {
    return agent.failed(`specty guard: ${messageOf(error)}`);
  }
}

/**
 * The hook's input with its event's name, from `--event` when the tool does not send it, and as
 * the guard reads it: normalized by the agent's adapter, when it has to.
 */
function eventOf(
  agent: AgentAdapter,
  parsed: Record<string, unknown>,
  named: string | undefined,
): { readonly given: Record<string, unknown>; readonly event: Record<string, unknown> } {
  const given =
    named === undefined || "hook_event_name" in parsed
      ? parsed
      : { ...parsed, hook_event_name: named };
  return { given, event: agent.normalize?.(given) ?? given };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The conversation's step in the folder it works in, for `status` to tell who holds each change
 * (ADR 0016). A conversation that ends no longer steps: it frees its front instead. Failing to
 * note it changes nothing of the answer.
 */
async function noted(
  kind: EventKind,
  tool: GuardTool,
  session: Session,
  event: Record<string, unknown>,
): Promise<void> {
  const conversation = conversationOf(event);
  if (conversation === undefined || kind === "ended") return;
  const step = { tool, conversation, folder: session.root, now: session.environment.now() };
  await noteActivity(session.git, step).catch(() => undefined);
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
      const said = withMessages(await afterShell(session, event), await waitingMessages(session));
      const card = await pendingCard(session, event);
      if (agent.late === undefined || said.allow) return agent.reply(said, "after", card);
      // A tool whose hook after a command cannot reach the model gets it with its next call.
      await leave(session, event, "warning", said.text);
      return agent.reply(ALLOW, "after", card);
    }
    case "invocation":
    case "turn":
      return await modelCall(kind, call);
    case "ended":
      await endConversation(session, agent.tool, event);
      return agent.reply(ALLOW, "after");
    default:
      return await beforeAction(call);
  }
}

/**
 * The verdict after a command with the messages for the session (ADR 0016): one that allowed no
 * longer does, so that they reach the model by the same way as a warning, in each agent's form.
 */
function withMessages(said: Verdict, messages: string | undefined): Verdict {
  if (messages === undefined) return said;
  if (said.allow) return { allow: false, reason: "messages", text: messages };
  return { ...said, text: `${said.text}\n\n${messages}` };
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
  const ctx = await guardContext(session);
  // A subagent must neither move nor bind the session that launched it (ARCHITECTURE §10).
  const asked = await subagentDenial(call, raw, ctx);
  if (asked !== undefined) return agent.reply(verdict(asked, session), "before");
  const action =
    raw.kind === "enter"
      ? await enterAction(environment, session, event, raw.request, cwd)
      : await resolveAction(call, raw);
  const entry = raw.kind === "shell" ? await enterCommand(call, raw.command, ctx) : undefined;
  const judged = entry?.decision.allow === false ? entry.decision : decideGuard(action, ctx);
  // One front per conversation, and none another one holds (ADR 0016).
  const decision =
    raw.kind === "shell"
      ? await judgeFronts({ session, tool: agent.tool, event }, raw.command, judged, ctx)
      : judged;
  // One change at a time per conversation: the worktree it may enter becomes its own.
  const target = action.kind === "enter" ? action.target : entry?.target;
  if (decision.allow && target !== undefined) await bindSession(session, event, target);
  if (decision.allow) await beforeShell(session, event, action);
  return await replyBefore(call, decision, action);
}

/**
 * The reply before an action. What goes through brings the input the agent's module rewrote and,
 * for an agent with `grants`, git's common folder: with a command, and with each action of a
 * conversation that entered a change's folder.
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
      ...(grants ? { folders: [await gitCommonFolder(session.git)] } : {}),
    },
    "before",
  );
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
  if (changes.writes.includes(DELEGATION_KEY) || changes.deletes.includes(DELEGATION_KEY)) {
    await revertDelegation(session, before[DELEGATION_KEY]);
  }
  return verdict(decideAfterShell(changes, await guardContext(session)), session);
}

async function revertDelegation(session: Session, previous: string | undefined): Promise<void> {
  const switchPath = await session.git.gitPath("common/specty/delegated.json");
  if (previous === undefined || previous === DELETED) {
    await remove(switchPath);
  }
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
  return { ...base, change: await guardChange(session, active) };
}

/** The active change as the guard judges it: its phase, its active task and what is locked. */
async function guardChange(session: Session, active: StoredChange): Promise<GuardChange> {
  const { state } = active;
  const taskEntry = Object.entries(state.tasks).find(([, task]) => task.status === "active");
  const testing = state.phase === "testing";
  const spec =
    taskEntry === undefined && !testing
      ? undefined
      : parseSpec(await readSpec(active.files), { language: session.lang }).spec;
  return {
    id: state.id,
    kind: state.kind,
    phase: state.phase,
    closingSubmitted: state.closingSubmittedAt !== undefined,
    specPath: session.paths.relative(active.files.spec),
    ...(taskEntry !== undefined
      ? {
          task: {
            id: taskEntry[0],
            files: taskFiles(spec, taskEntry[0]),
            extras: taskEntry[1].scopeExtra,
          },
        }
      : {}),
    ...(testing ? { files: plannedFiles(spec) } : {}),
    ...lockedOf(state, taskEntry?.[1].scopeExtra ?? []),
    ...integrationOf(state),
  };
}

/** The files the spec lists for the task `id`. */
function taskFiles(spec: Spec | undefined, id: string): readonly string[] {
  return spec?.sections.tasks?.items.find((task) => task.id === id)?.files ?? [];
}

/** In the testing phase, the tests of any of the change's files may be written (ADR 0014). */
function plannedFiles(spec: Spec | undefined): string[] {
  return [
    ...(spec?.sections.files?.items ?? []).map((entry) => entry.path),
    ...(spec?.sections.tasks?.items ?? []).flatMap((task) => task.files),
  ];
}

/** The approved tests still locked: one the person unlocked for the active task is open for it (ADR 0014). */
function lockedOf(state: ChangeState, extras: readonly string[]): Pick<GuardChange, "locked"> {
  if (state.lockedTests === undefined) return {};
  return { locked: Object.keys(state.lockedTests).filter((path) => !extras.includes(path)) };
}

/** The incorporation of the target branch the agent is resolving, if any. */
function integrationOf(state: ChangeState): Pick<GuardChange, "integration"> {
  if (state.integration === undefined || !isIntegrating(state)) return {};
  return { integration: { target: state.integration.target, paths: state.integration.paths } };
}

/** The decision as each agent's module answers it, with the reason and the next step. */
function verdict(decision: GuardDecision, session: Session): Verdict {
  if (decision.allow) return ALLOW;
  const label = session.lang === "es" ? "SIGUIENTE" : "NEXT";
  const text = `specty: ${decision.reason}\n${label}: ${decision.next}`;
  return { allow: false, reason: decision.reason, text };
}
