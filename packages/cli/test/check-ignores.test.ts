// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, CONFIG, cli, person, read, tempRepo } from "./support";

/** The checks are ready but for the agents; `scope.generated` adds Dart's generated code. */
const READY = [
  "checks:",
  "  levels: { secrets: off }",
  "  preCommit: true",
  "scope:",
  '  generated: ["**/*.g.dart"]',
  "",
].join("\n");

const WORKFLOW = { ".github/workflows/specty-check.yml": "name: mine\n" };

async function repo(files: Readonly<Record<string, string>>, config = CONFIG()): Promise<string> {
  return tempRepo({ ...APP, ...WORKFLOW, ".specty/config.yaml": `${config}${READY}`, ...files });
}

describe("specty check --install keeps the agents out of the noise", () => {
  it("writes each used agent's exclusions from checks.exclude and scope.generated", async () => {
    const root = await repo({
      ".cursor/rules.md": "x\n",
      "CLAUDE.md": "x\n",
      ".gemini/settings.json": "{}\n",
      ".windsurfrules": "x\n",
    });
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    for (const file of [".cursorignore", ".geminiignore", ".codeiumignore"]) {
      expect(plan.out).toContain(`${file} (crear)`);
    }
    expect(plan.out).toContain("+**/node_modules/**");
    expect(plan.out).toContain("+**/.dart_tool/**");
    expect(plan.out).toContain("+**/*.g.dart");
    expect(plan.out).toContain(".claude/settings.json (crear)");
    expect(plan.out).toContain('"Read(**/node_modules/**)"');
    expect(plan.out).toContain('"Read(**/*.g.dart)"');
  });

  it("adds only what is missing, keeps the rest, and has nothing to add the second time", async () => {
    const root = await repo({
      ".cursor/rules.md": "x\n",
      ".cursorignore": "secrets.txt\n**/node_modules/**\n",
      ".windsurfrules": "x\n",
      ".windsurfignore": "private/\n",
    });
    const run = await cli(root, ["check", "--install"], { terminal: person() });
    expect(run.code).toBe(0);
    const cursor = await read(root, ".cursorignore");
    expect(cursor.startsWith("secrets.txt\n**/node_modules/**\n")).toBe(true);
    expect(cursor.match(/\*\*\/node_modules\/\*\*/g)).toHaveLength(1);
    expect(cursor).toContain("**/dist/**");
    expect(await read(root, ".windsurfignore")).toContain("**/*.g.dart");
    const again = await cli(root, ["check", "--install", "--dry-run"]);
    expect(again.out).not.toContain("ignore (");
    expect(again.out).toContain("No hay nada que instalar.");
  });

  it("writes nothing for an agent the repository does not use", async () => {
    const root = await repo({});
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    expect(plan.out).not.toContain("ignore");
    expect(plan.out).not.toContain(".claude/settings.json");
  });

  it("gives one edit, with both changes, for two steps on the same file", async () => {
    const root = await repo({
      ".claude/settings.json": `${JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "specty guard --tool claude-code" }] }] } }, null, 2)}\n`,
    });
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    expect(plan.out.match(/\.claude\/settings\.json \(modificar\)/g)).toHaveLength(1);
    await cli(root, ["check", "--install"], { terminal: person() });
    const settings = JSON.parse(await read(root, ".claude/settings.json"));
    expect(settings.hooks.Stop[0].hooks[0].command).toBe("specty hook agent-stop claude-code");
    expect(settings.permissions.deny).toContain("Read(**/node_modules/**)");
  });

  it("explains the patterns in English", async () => {
    const root = await repo(
      { ".cursor/rules.md": "x\n" },
      CONFIG().replace("language: es", "language: en"),
    );
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    expect(plan.out).toContain(
      "+# Specty: dependencies, build output and generated code (specty check --install)",
    );
  });
});
