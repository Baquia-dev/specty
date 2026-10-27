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
      ".agents/rules/style.md": "x\n",
    });
    const plan = await cli(root, ["check", "--install", "--dry-run"]);
    for (const file of [".cursorignore", ".geminiignore", ".codeiumignore", ".antigravityignore"]) {
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

  it("denies OpenCode reading them in opencode.json, after the person's rules and at the root too (AC4)", async () => {
    const schema = "https://opencode.ai/config.json";
    const mine = { $schema: schema, permission: { read: { "*.env": "deny" } } };
    const root = await repo({ "opencode.json": `${JSON.stringify(mine, null, 2)}\n` });
    expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
    const config = JSON.parse(await read(root, "opencode.json"));
    expect(config.$schema).toBe(schema);
    const rules = config.permission.read;
    // The last rule that matches wins, so the person's stay first.
    expect(Object.keys(rules)[0]).toBe("*.env");
    for (const pattern of ["**/node_modules/**", "node_modules/**", "**/*.g.dart", "*.g.dart"]) {
      expect(rules[pattern], pattern).toBe("deny");
    }
    expect((await cli(root, ["check", "--install", "--dry-run"])).out).not.toContain(
      "opencode.json",
    );
  });

  it("keeps a single rule for every read as the first one, in opencode.jsonc if that is the file (AC4)", async () => {
    const root = await repo({ "opencode.jsonc": '{ "permission": { "read": "ask" } }\n' });
    await cli(root, ["check", "--install"], { terminal: person() });
    const rules = JSON.parse(await read(root, "opencode.jsonc")).permission.read;
    expect(Object.entries(rules)[0]).toEqual(["*", "ask"]);
    expect(rules["node_modules/**"]).toBe("deny");
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
