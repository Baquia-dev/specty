// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { type FakeGemini, fakeGemini, type GeminiCall } from "./fake-gemini";
import {
  CHANGE,
  CONFIG,
  cli,
  DIST,
  folderOf,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  tryGit,
  writeFiles,
} from "./support";

/**
 * Gemini CLI: `SPECTY_E2E_GEMINI`, or `gemini` in a folder of the PATH, found without running
 * anything. Undefined: the tests skip.
 */
function findGemini(): string | undefined {
  const configured = process.env.SPECTY_E2E_GEMINI;
  if (configured !== undefined && configured.length > 0) return configured;
  const folders = (process.env.PATH ?? "").split(delimiter).filter((folder) => folder !== "");
  return folders.map((folder) => join(folder, "gemini")).find((path) => existsSync(path));
}

const GEMINI = findGemini();
const LONG = { timeout: 240_000 };
// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";

/** A repository set up with `specty init`, so Gemini CLI loads Specty's hooks. */
async function initialized(checks = ""): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  });
  expect((await cli(root, ["init", "--language", "es", "--tools", "gemini-cli"])).code).toBe(0);
  await writeFiles(root, { ".specty/config.yaml": `${CONFIG()}${checks}` });
  git(root, "add", "-A");
  expect(tryGit(root, "commit", "-q", "-m", "chore: specty").status).toBe(0);
  return root;
}

/** A repository whose change is implementing T1 (`src/app.ts`, `src/app.test.ts`). */
async function implementing(): Promise<string> {
  const root = await initialized();
  expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  expect((await cli(root, ["next"])).out).toContain("TAREA T1");
  return root;
}

/**
 * Gemini CLI's own folder, temporary, with the fake as its model: nothing of the person's setup
 * takes part. It trusts the folder for the session and runs its tools without asking, so the
 * script plays through; Specty's hooks still decide each one.
 */
async function isolated(gemini: FakeGemini): Promise<NodeJS.ProcessEnv> {
  const home = await mkdtemp(join(tmpdir(), "specty-gemini-"));
  await mkdir(join(home, ".gemini"), { recursive: true });
  const settings = {
    security: { auth: { selectedType: "gemini-api-key" } },
    general: { disableAutoUpdate: true, disableUpdateNag: true },
    privacy: { usageStatisticsEnabled: false },
    tools: { allowed: ["run_shell_command", "write_file", "replace"] },
  };
  await writeFile(join(home, ".gemini", "settings.json"), JSON.stringify(settings));
  return {
    PATH: process.env.PATH ?? "",
    HOME: home,
    GEMINI_API_KEY: "specty-e2e",
    GOOGLE_GEMINI_BASE_URL: gemini.url,
    GEMINI_CLI_TRUST_WORKSPACE: "true",
    LANG: "es_ES.UTF-8",
  };
}

/** `gemini -p` in `root` against a fake that plays `script`. */
async function geminiRun(root: string, script: readonly GeminiCall[]): Promise<FakeGemini> {
  const gemini = await fakeGemini(script);
  const env = await isolated(gemini);
  const args = ["-p", "Sigue el guion.", "--model", "gemini-2.5-flash"];
  await new Promise<void>((resolve) => {
    const run = execFile(GEMINI ?? "", args, { cwd: root, env, timeout: 180_000 }, () => resolve());
    run.stdin?.end();
  });
  await gemini.close();
  // Had it not reached the fake, it would have gone nowhere: the key is fake.
  expect(gemini.requests().length).toBeGreaterThan(0);
  return gemini;
}

/** What the person's side of the conversation said, in every request. */
const prompts = (gemini: FakeGemini): string =>
  gemini
    .requests()
    .flatMap((request) => request.filter(({ role }) => role === "user").map(({ text }) => text))
    .join("\n");

const write = (path: string, content: string): GeminiCall => ({
  name: "write_file",
  args: { file_path: path, content },
});
const shell = (command: string): GeminiCall => ({
  name: "run_shell_command",
  args: { command, description: "Sigue el guion" },
});

describe.skipIf(GEMINI === undefined)(
  "Gemini CLI with a scripted model (needs Gemini CLI: SPECTY_E2E_GEMINI or the PATH)",
  () => {
    it(
      "blocks code, commits and person commands without a change, naming the way on (AC5)",
      LONG,
      async () => {
        const root = await initialized();
        await writeFiles(root, { "src/app.ts": "export const greet = () => 'adiós';\n" });
        const commits = git(root, "rev-list", "--count", "HEAD");
        const gemini = await geminiRun(root, [
          write(join(root, "src/nuevo.ts"), "export const nuevo = 1;\n"),
          shell("git commit -am 'Sin spec'"),
          shell("specty approve"),
        ]);
        const results = gemini.results();
        expect(results).toHaveLength(3);
        for (const result of results) expect(result).toMatch(/SIGUIENTE: /);
        expect(existsSync(join(root, "src/nuevo.ts"))).toBe(false);
        expect(git(root, "rev-list", "--count", "HEAD")).toBe(commits);
      },
    );

    it(
      "lets the task's files through and stops the others, with the card in the prompt (AC5)",
      LONG,
      async () => {
        const root = await implementing();
        const gemini = await geminiRun(root, [
          write(join(root, "src/app.test.ts"), "expect(greet('Ana')).toBe('Hola, Ana');\n"),
          write(join(root, "src/otro.ts"), "export const otro = 1;\n"),
        ]);
        const [inside, outside] = gemini.results();
        expect(inside).not.toMatch(/SIGUIENTE: /);
        expect(await read(root, "src/app.test.ts")).toContain("Hola, Ana");
        expect(outside).toContain("specty scope add src/otro.ts --task T1");
        expect(existsSync(join(root, "src/otro.ts"))).toBe(false);
        expect(prompts(gemini)).toContain("TAREA T1");
      },
    );

    it("warns what a command changed outside the task, in its result (AC5)", LONG, async () => {
      const root = await implementing();
      const gemini = await geminiRun(root, [
        shell(`node -e "require('fs').writeFileSync('src/otro.ts', 'x')"`),
      ]);
      expect(gemini.results()[0]).toContain("`src/otro.ts` está fuera del alcance de T1.");
    });

    it(
      "enters a change with specty enter, and writes, reads and runs in its folder (C2 AC6)",
      LONG,
      async () => {
        const root = await initialized();
        expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
        const folder = folderOf(root);
        const gemini = await geminiRun(root, [
          shell(`node "${DIST}" enter ${CHANGE}`),
          write(SPEC_PATH, "# Plan del saludo\n"),
          { name: "read_file", args: { file_path: SPEC_PATH } },
          shell("pwd"),
          { name: "grep_search", args: { pattern: "Plan del saludo" } },
        ]);
        const [entered, written, shown, ran, found] = gemini.results();
        expect(entered).toContain(`Esta conversación trabaja ahora en \`${folder}\``);
        expect(written).not.toMatch(/SIGUIENTE: /);
        expect(await read(folder, SPEC_PATH)).toBe("# Plan del saludo\n");
        expect(existsSync(join(root, SPEC_PATH))).toBe(false);
        expect(shown).toContain("# Plan del saludo");
        expect(ran).toContain(folder);
        expect(found).toContain("Found 1 match");
      },
    );

    it("sends the turn back once while specty check --changed fails (AC5)", LONG, async () => {
      const root = await initialized("checks:\n  levels: { secrets: off }\n");
      expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
      await writeFiles(root, {
        "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
      });
      const gemini = await geminiRun(root, []);
      expect(prompts(gemini)).toContain(
        "`specty check --changed` falla; corrígelo antes de terminar el turno:",
      );
      // The turn, and the one it was sent back for: then it may end.
      expect(gemini.requests()).toHaveLength(2);
    });
  },
);
