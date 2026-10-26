// SPDX-License-Identifier: Apache-2.0
import type { GuardTool } from "../enforce/actions";
import type { InstallFiles } from "../install/files";
import type { Git } from "../io/git";
import type { AgentAdapter } from "./adapter";
import { antigravity } from "./antigravity";
import { claudeCode } from "./claude-code";
import { codex } from "./codex";
import { cursor } from "./cursor";
import { opencode } from "./opencode";

/**
 * Each agent with Specty's guard and its module. The type asks for one module per agent the
 * capability table guards (`AGENT_CAPABILITIES`).
 */
export const ADAPTERS: Readonly<Record<GuardTool, AgentAdapter>> = {
  "claude-code": claudeCode,
  cursor,
  codex,
  opencode,
  antigravity,
};

/**
 * Takes Specty's hooks and settings out of each agent's files in the repository, leaving
 * everything else; a file left with nothing else goes.
 */
export async function removeAgentHooks(root: string, files: InstallFiles, git: Git): Promise<void> {
  for (const agent of Object.values(ADAPTERS)) await agent.remove(root, files, git);
}
