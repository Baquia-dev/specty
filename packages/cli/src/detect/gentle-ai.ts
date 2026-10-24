// SPDX-License-Identifier: Apache-2.0
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { codexHooksFile } from "../install/agents";
import { opencodePluginFile } from "../install/opencode";
import { readText } from "../io/files";

/**
 * gentle-ai's flow guidance: its ODD (`agent-routing`), which asks the agent for its own
 * work-unit commits and task document, and the blocks of its former SDD. Its other blocks
 * (persona, engram…) do not clash with Specty.
 */
const FLOW_BLOCKS: readonly string[] = ["agent-routing", "orchestrator", "sdd-orchestrator", "sdd"];

export interface GentleAiGuidance {
  /** The file, relative to the repository or to the home folder (`~/…`) when it is in one. */
  readonly file: string;
  readonly blocks: readonly string[];
}

/** The instruction files with gentle-ai's flow guidance: the repository's and each agent's own. */
export async function gentleAiGuidance(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<GentleAiGuidance[]> {
  const home = env.HOME ?? homedir();
  const files = [
    join(root, "AGENTS.md"),
    join(root, "CLAUDE.md"),
    // Where gentle-ai writes each agent's global instructions.
    join(home, ".claude", "CLAUDE.md"),
    join(dirname(codexHooksFile(env)), "AGENTS.md"),
    join(dirname(dirname(opencodePluginFile(env))), "AGENTS.md"),
    join(home, ".cursor", "rules", "gentle-ai.mdc"),
  ];
  const found: GentleAiGuidance[] = [];
  for (const file of new Set(files)) {
    const text = await readText(file);
    if (text === undefined) continue;
    const blocks = FLOW_BLOCKS.filter((name) => new RegExp(`<!-- gentle-ai:${name}\\s`).test(text));
    if (blocks.length > 0) found.push({ file: shown(file, root, home), blocks });
  }
  return found;
}

function shown(file: string, root: string, home: string): string {
  if (file.startsWith(`${root}/`)) return relative(root, file);
  return file.startsWith(`${home}/`) ? `~/${relative(home, file)}` : file;
}
