// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  analyzeShell,
  decideGuard,
  type GuardAction,
  type GuardChange,
  type GuardDecision,
  isGoverned,
  parseSpec,
} from "@baquia-dev/specty-core";
import { isFinished, resolveActive } from "../flow/active";
import { isRecord, parseJson } from "../io/files";
import { pathsOf } from "../io/git";
import { COMMAND, type Environment, openSession, type Session } from "../session";
import { readSpec } from "../store/changes";

export type GuardTool = "claude-code" | "cursor";

export interface GuardReply {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** A tool event, reduced to what the flow cares about. Paths are still as the tool sent them. */
type RawAction =
  | { readonly kind: "write" | "delete"; readonly paths: readonly string[] }
  | { readonly kind: "shell"; readonly command: string }
  | { readonly kind: "other" };

/**
 * `specty guard --tool <id>`: called by the agent's hooks before each action. It fails open
 * on its own errors (the git hooks and CI still apply) and never blocks outside Specty repos.
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
    const raw = tool === "claude-code" ? claudeAction(event) : cursorAction(event);
    const action = await resolveAction(session, raw, cwd);
    return reply(tool, decideGuard(action, await guardContext(session)), session);
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

function cwdOf(event: Record<string, unknown>, fallback: string): string {
  if (typeof event.cwd === "string" && event.cwd.length > 0) return event.cwd;
  const roots = event.workspace_roots;
  return Array.isArray(roots) && typeof roots[0] === "string" ? roots[0] : fallback;
}

function claudeAction(event: Record<string, unknown>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "Edit":
    case "MultiEdit":
    case "Write":
      return { kind: "write", paths: strings(input.file_path) };
    case "NotebookEdit":
      return { kind: "write", paths: strings(input.notebook_path) };
    case "Bash":
      return typeof input.command === "string"
        ? { kind: "shell", command: input.command }
        : { kind: "other" };
    default:
      return { kind: "other" };
  }
}

function cursorAction(event: Record<string, unknown>): RawAction {
  if (event.hook_event_name === "beforeShellExecution") {
    return typeof event.command === "string"
      ? { kind: "shell", command: event.command }
      : { kind: "other" };
  }
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  const paths = [input.file_path, input.path, input.target_file, input.filePath].flatMap(strings);
  switch (event.tool_name) {
    case "Shell":
      return typeof input.command === "string"
        ? { kind: "shell", command: input.command }
        : { kind: "other" };
    case "Write":
      return { kind: "write", paths };
    case "Delete":
      return { kind: "delete", paths };
    default:
      return { kind: "other" };
  }
}

function strings(value: unknown): string[] {
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

/**
 * Turns tool paths into repository-relative ones. Paths outside the repository and paths git
 * ignores (`node_modules/`, caches, builds) are not governed code, so they are dropped.
 */
async function inRepo(session: Session, cwd: string, paths: readonly string[]): Promise<string[]> {
  const inside = paths.flatMap((path) => {
    const relativePath = relative(session.root, resolve(cwd, path));
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) return [];
    return [relativePath.split(sep).join("/")];
  });
  // The root itself (`rm -rf .`) is never ignored, and git rejects an empty pathspec.
  const ignored = new Set(await session.git.ignored(inside.filter((path) => path !== "")));
  return inside.filter((path) => !ignored.has(path));
}

async function resolveAction(session: Session, raw: RawAction, cwd: string): Promise<GuardAction> {
  if (raw.kind === "other") return raw;
  if (raw.kind !== "shell") return { kind: raw.kind, paths: await inRepo(session, cwd, raw.paths) };
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
      writes: await inRepo(session, cwd, analysis.writes),
      deletes: await inRepo(session, cwd, analysis.deletes),
    },
  };
}

async function guardContext(session: Session) {
  const active = await resolveActive(session);
  const base = { config: session.config, lang: session.lang, command: COMMAND };
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
