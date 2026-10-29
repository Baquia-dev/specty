// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runCli } from "../../packages/cli/src/program";
import type { Terminal } from "../../packages/cli/src/session";

/**
 * The suite's throwaway repositories: isolated git, and Specty run in-process as in the CLI's
 * tests, with a person at the terminal when a step is theirs (an approval).
 */

/** The bundle the repositories' hooks run, and the agent too, through its `specty` wrapper. */
export const DIST = join(import.meta.dirname, "..", "..", "packages", "cli", "dist", "specty.mjs");

/** Isolated git: no global or system configuration, a fixed identity. */
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Ana",
  GIT_AUTHOR_EMAIL: "ana@example.com",
  GIT_COMMITTER_NAME: "Ana",
  GIT_COMMITTER_EMAIL: "ana@example.com",
};

/** The marks of an agent's shell, which would make Specty treat its own runs as an agent's. */
const AGENT_MARKS = [
  "CLAUDECODE",
  "CURSOR_AGENT",
  "GEMINI_CLI",
  "CODEX_SANDBOX",
  "CODEX_CI",
  "CODEX_THREAD_ID",
  "SPECTY_AGENT",
  "OPENCODE",
  "HGEDITOR",
  "JJ_EDITOR",
];

/**
 * The environment Specty and git run with: isolated git, Spanish, and the agents' user folders
 * (Codex, OpenCode) in temporary ones, so `init` never writes in the person's.
 */
function cliEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...GIT_ENV, LANG: "es_ES.UTF-8" };
  for (const mark of [...AGENT_MARKS, "LC_ALL", "LC_MESSAGES"]) delete env[mark];
  return {
    ...env,
    CODEX_HOME: join(tmpdir(), `specty-evals-codex-${process.pid}`),
    XDG_CONFIG_HOME: join(tmpdir(), `specty-evals-config-${process.pid}`),
  };
}

export function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, env: cliEnv(), encoding: "utf8" }).trim();
}

export async function write(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

export async function read(root: string, path: string): Promise<string | undefined> {
  return readFile(join(root, path), "utf8").catch(() => undefined);
}

/** A repository on `main` with `files` in its first commit. */
export async function disposableRepo(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "specty-evals-")));
  git(root, "init", "-q", "-b", "main");
  await write(root, files);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

/** A person who answers yes, takes the first option and writes nothing. */
const PERSON: Terminal = {
  interactive: true,
  confirm: async () => true,
  choose: async (_message, options) => options[0]?.value,
  chooseMany: async (_message, _options, initial) => [...initial],
  ask: async () => undefined,
  note: () => undefined,
};

/** An agent's shell: nobody answers. */
const NOBODY: Terminal = {
  interactive: false,
  confirm: async () => false,
  choose: async () => undefined,
  chooseMany: async () => undefined,
  ask: async () => undefined,
  note: () => undefined,
};

/**
 * `specty <argv>` in `root`, by the agent or, with `person`, by a person at the terminal, who
 * takes the option `choose` when a question offers it.
 */
export async function specty(
  root: string,
  argv: readonly string[],
  options: { readonly person?: boolean; readonly choose?: string } = {},
): Promise<{ readonly code: number; readonly out: string }> {
  const out: string[] = [];
  const { choose } = options;
  const person: Terminal =
    choose === undefined
      ? PERSON
      : {
          ...PERSON,
          choose: async (message, choices) =>
            choices.find((choice) => choice.value === choose)?.value ??
            PERSON.choose(message, choices),
        };
  const code = await runCli(argv, {
    cwd: root,
    env: cliEnv(),
    now: () => new Date(),
    terminal: options.person === true ? person : NOBODY,
    io: { out: (text) => out.push(text), err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
    stdin: async () => "",
  });
  return { code, out: out.join("\n") };
}

/** What the suite reads of a change's state. */
export interface ChangeState {
  readonly phase: string;
  readonly approved?: unknown;
  readonly tasks: Readonly<Record<string, { readonly scopeExtra: readonly string[] }>>;
  readonly pending: {
    readonly scopeRequests: readonly { readonly paths: readonly string[] }[];
    readonly adjustment: unknown;
  };
}

/** The open changes of `root`, each with its state. */
export async function openChanges(
  root: string,
): Promise<{ readonly id: string; readonly state: ChangeState }[]> {
  const folder = join(root, ".specty", "changes");
  const ids = await readdir(folder).catch(() => []);
  const changes = await Promise.all(
    ids.map(async (id) => {
      const text = await read(root, `.specty/changes/${id}/state.json`);
      const state: ChangeState | undefined = text === undefined ? undefined : JSON.parse(text);
      return state === undefined || state.phase === "done" || state.phase === "cancelled"
        ? []
        : [{ id, state }];
    }),
  );
  return changes.flat();
}

/** The only open change, if there is one. */
export async function openChange(
  root: string,
): Promise<{ readonly id: string; readonly state: ChangeState } | undefined> {
  return (await openChanges(root))[0];
}
