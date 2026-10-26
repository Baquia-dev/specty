// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { opencodeGuardLine, patchPaths } from "@baquia-dev/specty-core";
import { type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { hasGuard, OPENCODE_PLUGIN } from "../install/agents";
import { installOpencode, opencodePluginFile, planOpencodeStop } from "../install/opencode";
import { isRecord, readText } from "../io/files";
import {
  type AgentAdapter,
  blockingStop,
  doctorLines,
  exitFailed,
  exitReply,
  textCard,
} from "./adapter";

/**
 * OpenCode, through Specty's plugin (`install/opencode.ts`, ARCHITECTURE §10): it sends each tool
 * with no event name before it runs, `PostToolUse` after each shell command, and, once OpenCode
 * compacted a session, Claude Code's `SessionStart` with `compact` to get the card. The plugin
 * rejects the tool, or adds the warning to the command's result, when the guard exits with 2. At
 * the end of a turn it runs `specty hook agent-stop opencode` and reads Claude Code's answer.
 */
export const opencode: AgentAdapter = {
  tool: "opencode",
  kind: (event) => {
    if (event.hook_event_name === "PostToolUse") return "after";
    if (event.hook_event_name === "SessionStart" && event.source === "compact") return "compact";
    return "before";
  },
  action,
  reply: exitReply,
  failed: exitFailed,
  card: textCard,
  // `check --install` turns it on in the plugin, which keeps it once a turn went back to work.
  stop: {
    ...blockingStop([]),
    plan: ({ root, files, timeout }) => planOpencodeStop(root, files, timeout),
  },
  install: async ({ root, git, invocation, files, lang }) => {
    const { file, local } = await installOpencode(root, git, invocation, files);
    return {
      done: [opencodeGuardLine(file, local, lang)],
      warnings: [],
      written: local ? [] : [file],
    };
  },
  remove: async (root, files) => {
    const plugin = join(root, OPENCODE_PLUGIN);
    if (hasGuard(await files.read(plugin), "opencode")) await files.remove(plugin);
  },
  doctor: async (root) => {
    const plugin = await readText(join(root, OPENCODE_PLUGIN));
    const guard = hasGuard(plugin, "opencode");
    // A plugin from before the check after each command never sends `PostToolUse`, and one from
    // before the card after a compaction never listens to `session.compacted`.
    const afterShell = plugin?.includes('"PostToolUse"') === true;
    const lines = doctorLines([
      [
        guard && afterShell,
        { code: "opencode-guard", file: OPENCODE_PLUGIN },
        { code: guard ? "opencode-after-command" : "no-opencode-guard", file: OPENCODE_PLUGIN },
      ],
    ]);
    if (!guard || plugin?.includes("session.compacted") === true) return lines;
    return { ...lines, problems: [...lines.problems, { code: "opencode-compact" }] };
  },
  userFile: opencodePluginFile,
};

/**
 * The plugin sends the tool and its arguments as `tool_name` and `tool_input`, with the names of
 * OpenCode 2 and those of OpenCode 1 (`bash`, `filePath`, `multiedit`, `apply_patch`).
 */
function action(event: Readonly<Record<string, unknown>>): RawAction {
  const input = isRecord(event.tool_input) ? event.tool_input : {};
  switch (event.tool_name) {
    case "shell":
    case "bash":
      return shellAction(input.command);
    case "edit":
    case "write":
    case "multiedit":
      return { kind: "write", paths: [input.path, input.filePath].flatMap(sentPaths) };
    case "patch":
    case "apply_patch":
      return typeof input.patchText === "string"
        ? { kind: "files", ...patchPaths(input.patchText) }
        : { kind: "other" };
    default:
      return { kind: "other" };
  }
}
