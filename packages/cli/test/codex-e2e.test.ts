// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CodexCall, type FakeResponses, fakeResponses } from "./fake-responses";
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
 * Codex's CLI: `SPECTY_E2E_CODEX`, or `codex` in a folder of the PATH, found without running
 * anything. Undefined: the tests skip.
 */
function findCodex(): string | undefined {
  const configured = process.env.SPECTY_E2E_CODEX;
  if (configured !== undefined && configured.length > 0) return configured;
  const folders = (process.env.PATH ?? "").split(delimiter).filter((folder) => folder !== "");
  return folders.map((folder) => join(folder, "codex")).find((path) => existsSync(path));
}

const CODEX = findCodex();
const LONG = { timeout: 240_000 };
// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";

/** A repository set up with `specty init`, so Codex loads Specty's hooks. */
async function initialized(checks = ""): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  });
  expect((await cli(root, ["init", "--language", "es", "--tools", "codex"])).code).toBe(0);
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
 * Codex's own folder, temporary, with the fake as its model and the repository trusted: nothing of
 * the person's setup takes part.
 */
async function isolated(responses: FakeResponses, root: string): Promise<NodeJS.ProcessEnv> {
  const home = await mkdtemp(join(tmpdir(), "specty-codex-"));
  const codexHome = join(home, "codex");
  await mkdir(codexHome, { recursive: true });
  const config = [
    'model = "gpt-5.5"',
    'model_provider = "fake"',
    "",
    "[model_providers.fake]",
    'name = "fake"',
    `base_url = "${responses.url}"`,
    'wire_api = "responses"',
    'env_key = "SPECTY_E2E_KEY"',
    "",
    `[projects."${root}"]`,
    'trust_level = "trusted"',
    "",
  ].join("\n");
  await writeFile(join(codexHome, "config.toml"), config);
  // The model types `specty`, as Specty's rule for Codex names it: this build answers it.
  const bin = join(home, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "specty"), `#!/bin/sh\nexec node "${DIST}" "$@"\n`, { mode: 0o755 });
  return {
    PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    HOME: home,
    CODEX_HOME: codexHome,
    SPECTY_E2E_KEY: "sk-specty-e2e",
    LANG: "es_ES.UTF-8",
  };
}

/**
 * `codex exec` in `root` against a fake that plays `script`. The person authorized its two options
 * for these throwaway repositories: writing in the workspace, and the hooks without their review.
 */
async function codexRun(root: string, script: readonly CodexCall[]): Promise<FakeResponses> {
  const responses = await fakeResponses(script);
  const env = await isolated(responses, root);
  const args = [
    "exec",
    "--ephemeral",
    "-s",
    "workspace-write",
    "--dangerously-bypass-hook-trust",
    "-C",
    root,
    "--json",
    "Sigue el guion.",
  ];
  await new Promise<void>((resolve) => {
    const run = execFile(CODEX ?? "", args, { cwd: root, env, timeout: 180_000 }, () => resolve());
    // It reads a piped stdin into the prompt, so it would wait for one that never ends.
    run.stdin?.end();
  });
  await responses.close();
  // Had it not reached the fake, it would have gone nowhere: the key is fake.
  expect(responses.requests().length).toBeGreaterThan(0);
  return responses;
}

/** What the person's side of the conversation said, in every request. */
const prompts = (responses: FakeResponses): string =>
  responses
    .requests()
    .flatMap((request) => request.filter(({ role }) => role === "user").map(({ text }) => text))
    .join("\n");

const patch = (path: string, line: string): CodexCall => ({
  name: "apply_patch",
  input: ["*** Begin Patch", `*** Add File: ${path}`, `+${line}`, "*** End Patch", ""].join("\n"),
});
const shell = (cmd: string): CodexCall => ({ name: "exec_command", arguments: { cmd } });

describe.skipIf(CODEX === undefined)(
  "Codex with a scripted model (needs Codex: SPECTY_E2E_CODEX or the PATH)",
  () => {
    it(
      "blocks code, commits and person commands without a change, naming the way on (AC1)",
      LONG,
      async () => {
        const root = await initialized();
        await writeFiles(root, { "src/app.ts": "export const greet = () => 'adiós';\n" });
        const commits = git(root, "rev-list", "--count", "HEAD");
        const responses = await codexRun(root, [
          patch("src/nuevo.ts", "export const nuevo = 1;"),
          shell("git commit -am 'Sin spec'"),
          shell("specty approve"),
        ]);
        const results = responses.results();
        expect(results).toHaveLength(3);
        for (const result of results) expect(result).toMatch(/SIGUIENTE: /);
        expect(existsSync(join(root, "src/nuevo.ts"))).toBe(false);
        expect(git(root, "rev-list", "--count", "HEAD")).toBe(commits);
      },
    );

    it("lets the active task's files through and stops the others (AC1)", LONG, async () => {
      const root = await implementing();
      const responses = await codexRun(root, [
        patch("src/app.test.ts", "expect(greet('Ana')).toBe('Hola, Ana');"),
        patch("src/otro.ts", "export const otro = 1;"),
      ]);
      const [inside, outside] = responses.results();
      expect(inside).not.toMatch(/SIGUIENTE: /);
      expect(await read(root, "src/app.test.ts")).toContain("Hola, Ana");
      expect(outside).toContain("specty scope add src/otro.ts --task T1");
      expect(existsSync(join(root, "src/otro.ts"))).toBe(false);
    });

    it("warns what a command changed outside the task, in its result (AC1)", LONG, async () => {
      const root = await implementing();
      const responses = await codexRun(root, [
        shell(`node -e "require('fs').writeFileSync('src/otro.ts', 'x')"`),
      ]);
      expect(responses.results()[0]).toContain("`src/otro.ts` está fuera del alcance de T1.");
    });

    it(
      "enters a change with specty enter, and patches and completes a task in its folder (C4 AC4)",
      LONG,
      async () => {
        const root = await initialized();
        expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
        const folder = folderOf(root);
        // `new` prepared the folder with `npm install`, whose lock the task does not list.
        await rm(join(folder, "package-lock.json"), { force: true });
        await writeFiles(folder, { [SPEC_PATH]: SPEC });
        expect((await cli(folder, ["propose"])).code).toBe(0);
        await cli(folder, ["approve"], { terminal: person({ choose: ["confirm"] }) });
        expect((await cli(folder, ["next"])).out).toContain("TAREA T1");
        const commits = git(folder, "rev-list", "--count", "HEAD");
        const responses = await codexRun(root, [
          shell(`specty enter ${CHANGE}`),
          patch("src/app.test.ts", "expect(greet('Ana')).toBe('Hola, Ana');"),
          shell("specty task done T1 --summary 'Saludo por nombre'"),
        ]);
        const [entered, patched, done] = responses.results();
        expect(entered).toContain(`Esta conversación trabaja ahora en \`${folder}\``);
        expect(patched).not.toMatch(/SIGUIENTE: /);
        expect(await read(folder, "src/app.test.ts")).toContain("Hola, Ana");
        expect(existsSync(join(root, "src/app.test.ts"))).toBe(false);
        // Specty's command made its commit in the change's folder, outside Codex's sandbox.
        expect(done).toContain("T1 completada");
        expect(Number(git(folder, "rev-list", "--count", "HEAD"))).toBe(Number(commits) + 1);
      },
    );

    it("sends the turn back once while specty check --changed fails (AC1)", LONG, async () => {
      const root = await initialized("checks:\n  levels: { secrets: off }\n");
      expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
      await writeFiles(root, {
        "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
      });
      const responses = await codexRun(root, []);
      expect(prompts(responses)).toContain(
        "`specty check --changed` falla; corrígelo antes de terminar el turno:",
      );
      // The turn, and the one it was sent back for: then it may end.
      expect(responses.requests()).toHaveLength(2);
    });
  },
);
