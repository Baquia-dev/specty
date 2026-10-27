// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from "node:path";
import {
  codexGuardLine,
  codexRulesLine,
  codexTrustWarning,
  movePatch,
  patchPaths,
} from "@baquia-dev/specty-core";
import type { RawAction } from "../enforce/actions";
import {
  CODEX_HOOKS,
  CODEX_RULES,
  codexHooksFile,
  excludeLocally,
  hasGuard,
  missingEvents,
  removeFromJson,
  withHooks,
} from "../install/agents";
import { rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import { COMMAND } from "../session";
import {
  type AgentAdapter,
  blockingStop,
  doctorLines,
  exitFailed,
  exitReply,
  type Redirect,
  textCard,
} from "./adapter";

/**
 * The events the guard listens to. Each `matcher` is a regular expression on `tool_name` or, for
 * `SessionStart`, on how the session started.
 */
const EVENTS: Readonly<Record<string, string>> = {
  PreToolUse: "^(Bash|apply_patch)$",
  PostToolUse: "^Bash$",
  SessionStart: "^compact$",
};
/**
 * Codex's execpolicy rule for Specty's commands: an `allow` skips the approval and runs the
 * command outside the sandbox, which keeps `.git` read-only and so stopped every Specty commit.
 * It names the command as the agent types it, so it is versioned even when the hooks are local.
 */
const RULE = [
  "# Specty's commands run without asking and outside Codex's sandbox: they commit to git, which",
  "# the sandbox keeps read-only. Specty itself decides who runs each one (its guard, a real",
  "# terminal or delegated mode). `specty init` writes this file and rewrites it.",
  "prefix_rule(",
  `    pattern = [${JSON.stringify(COMMAND)}],`,
  '    decision = "allow",',
  '    justification = "Specty decides who runs its commands; they commit to git, which the sandbox keeps read-only.",',
  ")",
  "",
].join("\n");

/**
 * Codex (ARCHITECTURE §10): `PreToolUse` with `Bash` and `apply_patch`, `PostToolUse` with `Bash`,
 * which also comes after a command that failed, `SessionStart` after a compaction, whose output it
 * adds to the context, and `Stop`. It reads them as Claude Code does.
 */
export const codex: AgentAdapter = {
  tool: "codex",
  kind: (event) => {
    if (event.hook_event_name === "PostToolUse") return "after";
    // The matcher lets only a compaction through; the guard checks it again all the same.
    if (event.hook_event_name === "SessionStart" && event.source === "compact") return "compact";
    return "before";
  },
  action,
  redirect,
  // Codex runs the tool with `updatedInput`, which it takes only with `allow`.
  reply: (verdict, phase) =>
    phase === "before" && verdict.allow && verdict.input !== undefined
      ? {
          code: 0,
          stdout: JSON.stringify({
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "allow",
              updatedInput: verdict.input,
            },
          }),
          stderr: "",
        }
      : exitReply(verdict),
  failed: exitFailed,
  card: textCard,
  stop: blockingStop([CODEX_HOOKS]),
  // Codex 0.131 or later reads a linked worktree's project hooks from the main checkout, so the
  // person trusts them once per repository.
  install: async ({ root, git, invocation, files, lang }) => {
    const local = !invocation.portable;
    const command = `${invocation.command} guard --tool codex`;
    await rewriteJson(
      join(root, CODEX_HOOKS),
      (value) => withHooks(value, EVENTS, "codex", command),
      true,
      files,
    );
    if (local) await excludeLocally(git, CODEX_HOOKS, files);
    await files.write(join(root, CODEX_RULES), RULE);
    return {
      done: [codexGuardLine(CODEX_HOOKS, local, lang), codexRulesLine(CODEX_RULES, lang)],
      warnings: [codexTrustWarning(lang)],
      written: [...(local ? [] : [CODEX_HOOKS]), CODEX_RULES],
    };
  },
  remove: async (root, files) => {
    const update = (value: Record<string, unknown>) => withHooks(value, EVENTS, "codex", undefined);
    await removeFromJson(root, CODEX_HOOKS, update, files);
    const rules = join(root, CODEX_RULES);
    if (isRule(await files.read(rules))) await files.remove(rules);
  },
  doctor: async (root) => {
    const hooks = await readText(join(root, CODEX_HOOKS));
    const guard = hasGuard(hooks, "codex");
    const lines = doctorLines([
      [
        guard,
        { code: "codex-guard", file: CODEX_HOOKS },
        { code: "no-codex-guard", file: CODEX_HOOKS },
      ],
      [
        isRule(await readText(join(root, CODEX_RULES))),
        { code: "codex-rules", file: CODEX_RULES },
        { code: "no-codex-rules", file: CODEX_RULES },
      ],
    ]);
    // An install from before the card after a compaction has the guard without `SessionStart`.
    if (!guard || missingEvents([hooks], ["SessionStart"], "codex").length === 0) return lines;
    return {
      ...lines,
      problems: [...lines.problems, { code: "codex-compact", file: CODEX_HOOKS }],
    };
  },
  userFile: codexHooksFile,
};

/** Whether `text`, a rules file, is Specty's rule for its commands. */
function isRule(text: string | undefined): boolean {
  return text?.includes(`pattern = [${JSON.stringify(COMMAND)}]`) === true;
}

/**
 * A patch with the paths of its headers in the conversation's folder (`movePatch`), and a
 * command after a `cd` to that folder when the conversation works in another one. Codex takes
 * both back as the tool's `command`. Its hook does not see a folder the model gives
 * `exec_command`, so the `cd` names the folder's whole path.
 */
function redirect(
  event: Readonly<Record<string, unknown>>,
  to: Redirect,
): Record<string, unknown> | undefined {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  if (typeof input.command !== "string") return undefined;
  const base = typeof event.cwd === "string" ? event.cwd : "";
  if (event.tool_name === "apply_patch") {
    const moved = movePatch(input.command, (path) => {
      const there = to.path(resolve(base, path));
      return there === resolve(base, path) ? path : there;
    });
    return moved === input.command ? undefined : { ...input, command: moved };
  }
  if (event.tool_name !== "Bash" || to.folder === base) return undefined;
  const folder = to.folder.replaceAll("'", `'\\''`);
  return { ...input, command: `cd '${folder}' && ${input.command}` };
}

/** Codex sends a command and a patch alike in `tool_input.command`. */
function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  if (typeof input.command !== "string") return { kind: "other" };
  switch (event.tool_name) {
    case "Bash":
      return { kind: "shell", command: input.command };
    case "apply_patch":
      return { kind: "files", ...patchPaths(input.command) };
    default:
      return { kind: "other" };
  }
}
