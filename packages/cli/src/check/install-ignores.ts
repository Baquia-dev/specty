// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { AGENT_CAPABILITIES, type AgentTool, translator } from "@baquia-dev/specty-core";
import { type InstallFiles, rewriteJson } from "../install/files";
import { exists, isRecord } from "../io/files";
import type { Session } from "../session";

/**
 * Keeps each agent the repository uses out of the noise (ADR 0012): dependencies, build output
 * and generated code, by the globs of `checks.exclude` and `scope.generated`. Each agent has its
 * own place for it, per its documentation, with the syntax of `.gitignore`; only the patterns
 * missing there are added, and everything else in the file stays.
 */

interface IgnoreFile {
  readonly tool: AgentTool;
  /** The names the agent reads, the current one first. */
  readonly names: readonly string[];
  /** The one to create when there is none. */
  readonly create: string;
}

const IGNORE_FILES: readonly IgnoreFile[] = [
  { tool: "cursor", names: [".cursorignore"], create: ".cursorignore" },
  { tool: "gemini-cli", names: [".geminiignore"], create: ".geminiignore" },
  // Windsurf, now Devin, reads `.devinignore` and still the older names; the oldest suits both.
  {
    tool: "windsurf",
    names: [".devinignore", ".windsurfignore", ".codeiumignore"],
    create: ".codeiumignore",
  },
];

/** Plans the exclusions into `files`, the plan's files, for each agent in use. */
export async function agentIgnores(session: Session, files: InstallFiles): Promise<void> {
  const { root, config } = session;
  const patterns = [...new Set([...config.checks.exclude, ...config.scope.generated])];
  if (patterns.length === 0) return;
  for (const ignore of IGNORE_FILES) {
    if (!(await uses(root, ignore.tool))) continue;
    const found = await Promise.all(
      ignore.names.map(async (name) =>
        (await files.read(join(root, name))) === undefined ? [] : [name],
      ),
    );
    const file = join(root, found.flat()[0] ?? ignore.create);
    const text = (await files.read(file)) ?? "";
    const present = new Set(text.split(/\r?\n/).map((line) => line.trim()));
    const missing = patterns.filter((pattern) => !present.has(pattern));
    if (missing.length === 0) continue;
    const comment = `# ${translator(session.lang)(
      "Specty: dependencias, artefactos de build y código generado (specty check --install)",
      "Specty: dependencies, build output and generated code (specty check --install)",
    )}`;
    const block = [...(present.has(comment) ? [] : [comment]), ...missing].join("\n");
    const lead = text === "" ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    await files.write(file, `${text}${lead}${block}\n`);
  }
  if (await uses(root, "claude-code")) {
    const deny = patterns.map((pattern) => `Read(${pattern})`);
    await rewriteJson(
      join(root, ".claude/settings.json"),
      (value) => withDeny(value, deny),
      true,
      files,
    );
  }
}

/** The agent is in use when one of its markers is in the repository. */
async function uses(root: string, tool: AgentTool): Promise<boolean> {
  const found = await Promise.all(
    AGENT_CAPABILITIES[tool].markers.map((marker) => exists(join(root, marker))),
  );
  return found.some(Boolean);
}

/** Claude Code's `Read` deny rules, after the ones the file already had. */
function withDeny(
  value: Record<string, unknown>,
  rules: readonly string[],
): Record<string, unknown> {
  const permissions = isRecord(value.permissions) ? value.permissions : {};
  const current: unknown[] = Array.isArray(permissions.deny) ? permissions.deny : [];
  const missing = rules.filter((rule) => !current.includes(rule));
  if (missing.length === 0) return value;
  return { ...value, permissions: { ...permissions, deny: [...current, ...missing] } };
}
