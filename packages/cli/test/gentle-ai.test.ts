// SPDX-License-Identifier: Apache-2.0
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODEX_HOME, cli, read, tempRepo, writeFiles } from "./support";

/** A block as gentle-ai writes it in an agent's instructions. */
const block = (name: string) =>
  `<!-- gentle-ai:${name} -->\nCommit work units in reviewable slices.\n<!-- /gentle-ai:${name} -->\n`;

describe("doctor and gentle-ai", () => {
  it("warns about gentle-ai's flow guidance in the repository and the agents' global files", async () => {
    const home = await mkdtemp(join(tmpdir(), "specty-home-"));
    const env = { HOME: home };
    const root = await tempRepo({ "package.json": '{"name":"x","scripts":{"test":"true"}}\n' });
    await cli(root, ["init", "--language", "es", "--tools", "claude-code"], { env });
    const before = await cli(root, ["doctor"], { env });
    expect(before.out).not.toContain("gentle-ai: ");
    await writeFiles(root, {
      "AGENTS.md": `${await read(root, "AGENTS.md")}\n${block("orchestrator")}`,
    });
    await writeFiles(home, {
      ".claude/CLAUDE.md": `# Mis reglas\n\n${block("persona")}${block("agent-routing")}`,
      ".cursor/rules/gentle-ai.mdc": `${block("sdd-orchestrator")}${block("engram-protocol")}`,
    });
    await writeFiles(CODEX_HOME, { "AGENTS.md": block("persona") });
    const doctor = await cli(root, ["doctor"], { env });
    expect(doctor.code).toBe(1);
    expect(doctor.out).toContain(
      "gentle-ai: ~/.claude/CLAUDE.md tiene su guía de flujo (`agent-routing`), que pide al agente sus propios commits y su propio plan; el guard de Specty bloquea esos commits. Quita esos bloques de ~/.claude/CLAUDE.md para trabajar con Specty.",
    );
    expect(doctor.out).toContain("gentle-ai: AGENTS.md tiene su guía de flujo (`orchestrator`)");
    expect(doctor.out).toContain(
      "gentle-ai: ~/.cursor/rules/gentle-ai.mdc tiene su guía de flujo (`sdd-orchestrator`)",
    );
    // Blocks that do not clash with Specty, such as the persona, are not named.
    expect(doctor.out).not.toContain("`persona`");
    expect(doctor.out).not.toContain(join(CODEX_HOME, "AGENTS.md"));
  });
});
