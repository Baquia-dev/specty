// SPDX-License-Identifier: Apache-2.0
import { execFile, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type FakeModel, fakeModel, type ToolUse } from "./fake-model";
import {
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  tryGit,
  writeFiles,
} from "./support";

/** Editors whose Claude Code extension carries the CLI. */
const EDITORS = [".vscode", ".cursor", ".windsurf", ".antigravity-ide"];

/**
 * Claude Code's CLI: `SPECTY_E2E_CLAUDE`, `claude` on the PATH, or the newest one an editor
 * extension carries. Undefined when there is none: the tests skip.
 */
function findClaude(): string | undefined {
  const configured = process.env.SPECTY_E2E_CLAUDE;
  if (configured !== undefined && configured.length > 0) return configured;
  if (spawnSync("claude", ["--version"], { encoding: "utf8" }).status === 0) return "claude";
  const bundled = EDITORS.flatMap((editor) => {
    const folder = join(homedir(), editor, "extensions");
    if (!existsSync(folder)) return [];
    return readdirSync(folder)
      .filter((name) => name.startsWith("anthropic.claude-code-"))
      .flatMap((name) =>
        ["claude", "claude.exe"].map((binary) =>
          join(folder, name, "resources", "native-binary", binary),
        ),
      )
      .filter((path) => existsSync(path));
  });
  return bundled.toSorted((a, b) => compareVersions(versionOf(a), versionOf(b))).at(-1);
}

function versionOf(path: string): number[] {
  const version = /anthropic\.claude-code-(\d+(?:\.\d+)*)/.exec(path)?.[1] ?? "0";
  return version.split(".").map(Number);
}

function compareVersions(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

const CLAUDE = findClaude();

/** A repository set up with `specty init`, so Claude Code runs Specty's real hooks. */
async function initialized(): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  });
  const result = await cli(root, ["init", "--language", "es", "--tools", "claude-code"]);
  expect(result.code).toBe(0);
  await writeFiles(root, { ".specty/config.yaml": CONFIG() });
  git(root, "add", "-A");
  expect(tryGit(root, "commit", "-q", "-m", "chore: specty").status).toBe(0);
  return root;
}

/**
 * Runs Claude Code headless in `root` against a fake model that plays `script`. Nothing of the
 * person's setup takes part: its own config and home, a fake key, project settings only, no MCP.
 */
async function claudeWith(root: string, script: readonly ToolUse[]): Promise<FakeModel> {
  const model = await fakeModel(script);
  const home = await mkdtemp(join(tmpdir(), "specty-claude-"));
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    CLAUDE_CONFIG_DIR: join(home, "config"),
    ANTHROPIC_BASE_URL: model.url,
    ANTHROPIC_API_KEY: "sk-ant-specty-e2e",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_TELEMETRY: "1",
    DISABLE_AUTOUPDATER: "1",
    DISABLE_ERROR_REPORTING: "1",
    LANG: "es_ES.UTF-8",
  };
  const args = [
    "-p",
    "Sigue el guion.",
    // With the bundle's absolute path, `init` puts the hooks in the local settings.
    "--setting-sources",
    "project,local",
    "--strict-mcp-config",
    "--tools",
    "Write,Bash",
    "--dangerously-skip-permissions",
    "--max-turns",
    String(script.length + 2),
    "--output-format",
    "json",
    "--model",
    "claude-sonnet-4-5",
  ];
  await new Promise<void>((resolve) => {
    execFile(CLAUDE ?? "claude", args, { cwd: root, env, timeout: 90_000 }, () => resolve());
  });
  await model.close();
  // Had it not reached the fake, it would have gone nowhere: the key is fake.
  expect(model.turns()).toBeGreaterThan(0);
  return model;
}

const write = (path: string, content: string): ToolUse => ({
  name: "Write",
  input: { file_path: path, content },
});
const bash = (command: string): ToolUse => ({ name: "Bash", input: { command } });

describe.skipIf(CLAUDE === undefined)(
  "Claude Code with a scripted model (needs Claude Code: SPECTY_E2E_CLAUDE, the PATH or an editor extension)",
  () => {
    it("blocks code, commits and person commands without a change, naming the way on", async () => {
      const root = await initialized();
      await writeFiles(root, { "src/app.ts": "export const greet = () => 'adiós';\n" });
      const commits = git(root, "rev-list", "--count", "HEAD");
      const model = await claudeWith(root, [
        write(join(root, "src/nuevo.ts"), "export const nuevo = 1;\n"),
        bash("git commit -am 'Sin spec'"),
        bash("specty approve"),
      ]);
      const results = model.results();
      expect(results.map((result) => result.isError)).toEqual([true, true, true]);
      for (const result of results) {
        expect(result.text).toContain("guard --tool claude-code");
        expect(result.text).toMatch(/^SIGUIENTE: /m);
      }
      expect(results[0]?.text).toContain("SIGUIENTE: ejecuta `specty next`.");
      // There is no task: `task done` would be refused too.
      expect(results[1]?.text).toContain(
        "SIGUIENTE: ejecuta `specty next`: te dice cómo seguir con ese código.",
      );
      expect(results[2]?.text).toContain("SIGUIENTE: pídele al usuario que lo ejecute");
      expect(existsSync(join(root, "src/nuevo.ts"))).toBe(false);
      expect(git(root, "rev-list", "--count", "HEAD")).toBe(commits);
    });

    it("lets the active task's files through and stops the others", async () => {
      const root = await initialized();
      expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
      await writeFiles(root, { [SPEC_PATH]: SPEC });
      expect((await cli(root, ["propose"])).code).toBe(0);
      const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
      expect(approved.code).toBe(0);
      expect((await cli(root, ["next"])).out).toContain("TAREA T1");
      const model = await claudeWith(root, [
        write(join(root, "src/app.test.ts"), "expect(greet('Ana')).toBe('Hola, Ana');\n"),
        write(join(root, "src/otro.ts"), "export const otro = 1;\n"),
      ]);
      const [inside, outside] = model.results();
      expect(inside?.isError).toBe(false);
      expect(await read(root, "src/app.test.ts")).toContain("Hola, Ana");
      expect(outside?.isError).toBe(true);
      expect(outside?.text).toContain("specty scope add src/otro.ts --task T1");
      expect(existsSync(join(root, "src/otro.ts"))).toBe(false);
    });
  },
);
