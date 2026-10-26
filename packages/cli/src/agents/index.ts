// SPDX-License-Identifier: Apache-2.0
import type { GuardTool } from "../enforce/actions";
import type { AgentAdapter } from "./adapter";
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
};
