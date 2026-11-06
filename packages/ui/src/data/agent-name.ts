// SPDX-License-Identifier: Apache-2.0
// An agent's name by its tool, from core's list, for every view that says who held a change. Pure.
import { AGENT_NAMES } from "@baquia-dev/specty-core/light";

/** The agents' names, by their tool. */
const NAMES: Readonly<Record<string, string>> = AGENT_NAMES;

/** The name of the agent of `tool` («Codex»); a tool the list does not know goes by its id. */
export function agentName(tool: string): string {
  return (Object.hasOwn(NAMES, tool) ? NAMES[tool] : undefined) ?? tool;
}
