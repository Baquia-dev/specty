// SPDX-License-Identifier: Apache-2.0
import { opencodeGuardLine, patchPaths } from "@baquia-dev/specty-core";
import { type RawAction, sentPaths, shellAction } from "../enforce/actions";
import { installOpencode } from "../install/opencode";
import { isRecord } from "../io/files";
import { type AgentAdapter, exitFailed, exitReply } from "./adapter";

/**
 * OpenCode, through Specty's plugin (`install/opencode.ts`, ARCHITECTURE §10): it sends each tool
 * with no event name before it runs, and `PostToolUse` after each shell command. The plugin
 * rejects the tool, or adds the warning to the command's result, when the guard exits with 2.
 */
export const opencode: AgentAdapter = {
  tool: "opencode",
  kind: (event) => (event.hook_event_name === "PostToolUse" ? "after" : "before"),
  action,
  reply: exitReply,
  failed: exitFailed,
  install: async ({ root, git, invocation, files, lang }) => {
    const { file, local } = await installOpencode(root, git, invocation, files);
    return {
      done: [opencodeGuardLine(file, local, lang)],
      warnings: [],
      written: local ? [] : [file],
    };
  },
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
