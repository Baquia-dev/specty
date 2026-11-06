// SPDX-License-Identifier: Apache-2.0
import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type FakeChat, fakeChat, type ToolCall } from "./fake-chat";
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
 * OpenCode's CLI: `SPECTY_E2E_OPENCODE` or `opencode` on the PATH, from 2.2 on, whose tools,
 * `opencode run` and `opencode serve` the tests drive. Undefined, or older: the tests skip.
 */
function findOpencode(): string | undefined {
  const configured = process.env.SPECTY_E2E_OPENCODE;
  const command = configured !== undefined && configured.length > 0 ? configured : "opencode";
  const found = spawnSync(command, ["--version"], { encoding: "utf8" });
  const version = /(\d+)\.(\d+)/.exec(found.stdout ?? "");
  const [major, minor] = [Number(version?.[1] ?? 0), Number(version?.[2] ?? 0)];
  return found.status === 0 && (major > 2 || (major === 2 && minor >= 2)) ? command : undefined;
}

const OPENCODE = findOpencode();
/**
 * Where OpenCode keeps the packages it installs: shared by the runs (`SPECTY_TESTS_CACHE`, from
 * `packages/core/vitest-temp-dir.ts`), so the tests download them once.
 */
const CACHE = join(process.env.SPECTY_TESTS_CACHE ?? tmpdir(), "specty-e2e-opencode-cache");
const LONG = { timeout: 240_000 };
// Put together from parts, so that this file does not trip `specty check`.
const TODO = "TODO";

/** A repository set up with `specty init`, so OpenCode loads Specty's plugin. */
async function initialized(checks = ""): Promise<string> {
  const root = await tempRepo({
    "src/app.ts": "export const greet = () => 'hola';\n",
    "package.json": '{"name":"demo","scripts":{"test":"true"}}\n',
  });
  expect((await cli(root, ["init", "--language", "es", "--tools", "opencode"])).code).toBe(0);
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
 * OpenCode's own folders, temporary but for its package cache, with a provider that talks to the
 * fake: nothing of the person's setup takes part, and the repository's `opencode.json` stays.
 */
async function isolated(chat: FakeChat): Promise<NodeJS.ProcessEnv> {
  const home = await mkdtemp(join(tmpdir(), "specty-opencode-"));
  const config = join(home, "config");
  await mkdir(join(config, "opencode"), { recursive: true });
  const provider = {
    npm: "@ai-sdk/openai-compatible",
    name: "Fake",
    options: { baseURL: chat.url, apiKey: "sk-specty-e2e" },
    models: { scripted: { name: "Scripted", tool_call: true } },
  };
  const settings = { provider: { fake: provider }, model: "fake/scripted", autoupdate: false };
  await writeFile(join(config, "opencode", "opencode.json"), JSON.stringify(settings));
  return {
    PATH: process.env.PATH ?? "",
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: join(home, "data"),
    XDG_STATE_HOME: join(home, "state"),
    XDG_CACHE_HOME: CACHE,
    // What installs with npm (OpenCode 1.19 did, its plugin's packages) would cache in `HOME`.
    npm_config_cache: join(CACHE, "npm"),
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    LANG: "es_ES.UTF-8",
  };
}

/**
 * `opencode run` in `root` against a fake that plays `script`, and to each subagent whose task
 * carries a mark of `subagents`, that mark's script. `--standalone` runs it with a server of its
 * own, in the isolated environment, instead of the person's background service.
 */
async function opencodeRun(
  root: string,
  script: readonly ToolCall[],
  subagents: Readonly<Record<string, readonly ToolCall[]>> = {},
): Promise<FakeChat> {
  const chat = await fakeChat(script, subagents);
  const env = await isolated(chat);
  const args = ["run", "--standalone", "--model", "fake/scripted", "Sigue el guion."];
  await new Promise<void>((resolve) => {
    const run = execFile(OPENCODE ?? "opencode", args, { cwd: root, env, timeout: 180_000 }, () =>
      resolve(),
    );
    // It reads a piped stdin into the message, so it would wait for one that never ends.
    run.stdin?.end();
  });
  await chat.close();
  // Had it not reached the fake, it would have gone nowhere: the key is fake.
  expect(chat.requests().length).toBeGreaterThan(0);
  return chat;
}

/** A request to OpenCode's API: a `POST` with `body`, a `GET` without it. */
type Request = (path: string, body?: unknown) => Promise<unknown>;

/**
 * `opencode serve` in `root`, as OpenCode's interface runs it, with one session to talk to over
 * HTTP: the end of a turn and a compaction need a server that outlives the turn. Its API asks for
 * the password the test gives it, and each message and compaction wait until the session is idle.
 */
async function served(root: string, chat: FakeChat) {
  const port = await freePort();
  const password = "specty-e2e";
  const env = { ...(await isolated(chat)), OPENCODE_SERVER_PASSWORD: password };
  const server = spawn(
    OPENCODE ?? "opencode",
    ["serve", "--port", String(port), "--hostname", "127.0.0.1"],
    { cwd: root, env, stdio: "ignore" },
  );
  const base = `http://127.0.0.1:${port}/api`;
  const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
  const request: Request = async (path, body) => {
    const init = body === undefined ? {} : { method: "POST", body: JSON.stringify(body) };
    const headers = { "content-type": "application/json", authorization };
    const response = await fetch(`${base}${path}`, { ...init, headers });
    const text = await response.text();
    if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
    return text === "" ? undefined : JSON.parse(text);
  };
  const id = await sessionIn(root, request).catch((error: unknown) => {
    // A server that never answered would outlive the test.
    server.kill();
    throw error;
  });
  const idle = () => request(`/experimental/session/${id}/wait`, {});
  return {
    say: async (text: string) => {
      await request(`/session/${id}/prompt`, { text });
      await idle();
    },
    compact: async () => {
      await request(`/session/${id}/compact`, {});
      await idle();
    },
    close: () => server.kill(),
  };
}

/** The id of a new session in `root`, once the server answers. */
async function sessionIn(root: string, request: Request): Promise<string> {
  await vi.waitFor(() => request("/session"), { timeout: 60_000, interval: 250 });
  const created = await request("/session", { location: { directory: root } });
  const data =
    typeof created === "object" && created !== null && "data" in created ? created.data : undefined;
  return typeof data === "object" && data !== null && "id" in data ? String(data.id) : "";
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// OpenCode 2.2's tools, with its fields.
const write = (path: string, content: string): ToolCall => ({
  name: "write",
  arguments: { path, content },
});
const shell = (command: string): ToolCall => ({ name: "shell", arguments: { command } });
/** A subagent launched with a task that carries `mark`, so the fake plays it its own script. */
const delegate = (mark: string, task: string): ToolCall => ({
  name: "subagent",
  arguments: { description: task, prompt: `${mark}: ${task}`, agent: "general" },
});

const OTHER = CHANGE.replace("saludo-personalizado", "otro-cambio");
const OTHER_SPEC = `.specty/changes/${OTHER}/spec.md`;

/** The folder the guard bound each conversation of `root` to, by OpenCode's session. */
async function bindings(root: string): Promise<Readonly<Record<string, string>>> {
  const sessions = ".git/common/specty/sessions";
  const files = existsSync(join(root, sessions)) ? await readdir(join(root, sessions)) : [];
  const bound = await Promise.all(
    files.map(async (file) => {
      const { folder } = JSON.parse(await read(root, join(sessions, file)));
      return [file.replace(/\.json$/, ""), String(folder)] as const;
    }),
  );
  return Object.fromEntries(bound);
}

describe.skipIf(OPENCODE === undefined)(
  "OpenCode with a scripted model (needs OpenCode 2.2 or later: SPECTY_E2E_OPENCODE or the PATH)",
  () => {
    it(
      "blocks code, commits and person commands without a change, naming the way on (AC1)",
      LONG,
      async () => {
        const root = await initialized();
        await writeFiles(root, { "src/app.ts": "export const greet = () => 'adiós';\n" });
        const commits = git(root, "rev-list", "--count", "HEAD");
        const chat = await opencodeRun(root, [
          write(join(root, "src/nuevo.ts"), "export const nuevo = 1;\n"),
          shell("git commit -am 'Sin spec'"),
          shell("specty approve"),
        ]);
        const results = chat.results();
        expect(results).toHaveLength(3);
        for (const result of results) expect(result).toMatch(/SIGUIENTE: /);
        expect(results[2]).toContain("SIGUIENTE: pídele al usuario que lo ejecute");
        expect(existsSync(join(root, "src/nuevo.ts"))).toBe(false);
        expect(git(root, "rev-list", "--count", "HEAD")).toBe(commits);
      },
    );

    it("lets the active task's files through and stops the others (AC2)", LONG, async () => {
      const root = await implementing();
      const chat = await opencodeRun(root, [
        write(join(root, "src/app.test.ts"), "expect(greet('Ana')).toBe('Hola, Ana');\n"),
        write(join(root, "src/otro.ts"), "export const otro = 1;\n"),
      ]);
      const [inside, outside] = chat.results();
      expect(inside).not.toMatch(/SIGUIENTE: /);
      expect(await read(root, "src/app.test.ts")).toContain("Hola, Ana");
      expect(outside).toContain("specty scope add src/otro.ts --task T1");
      expect(existsSync(join(root, "src/otro.ts"))).toBe(false);
    });

    it("warns what a command changed outside the task, in its result (AC3)", LONG, async () => {
      const root = await implementing();
      const chat = await opencodeRun(root, [
        shell(`node -e "require('fs').writeFileSync('src/otro.ts', 'x')"`),
      ]);
      expect(chat.results()[0]).toContain("`src/otro.ts` está fuera del alcance de T1.");
    });

    it(
      "enters a change with specty enter, and writes, reads and runs in its folder (C3 AC5)",
      LONG,
      async () => {
        const root = await initialized();
        expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
        const folder = folderOf(root);
        const chat = await opencodeRun(root, [
          shell(`node "${DIST}" enter ${CHANGE}`),
          write(SPEC_PATH, "# Plan del saludo\n"),
          { name: "read", arguments: { path: SPEC_PATH } },
          shell("pwd"),
        ]);
        const [entered, written, shown, ran] = chat.results();
        expect(entered).toContain(`Esta conversación trabaja ahora en \`${folder}\``);
        expect(written).not.toMatch(/SIGUIENTE: |rejected|denied/i);
        expect(await read(folder, SPEC_PATH)).toBe("# Plan del saludo\n");
        expect(existsSync(join(root, SPEC_PATH))).toBe(false);
        expect(shown).toContain("# Plan del saludo");
        expect(ran).toContain(folder);
      },
    );

    describe("AC3: a subagent that OpenCode launches with subagent (subagents)", () => {
      it(
        "works in the folder its child session entered, and its session stays in its own",
        LONG,
        async () => {
          const root = await initialized();
          expect((await cli(root, ["new", "--worktree", "Saludo personalizado"])).code).toBe(0);
          expect((await cli(root, ["new", "--worktree", "Otro cambio"])).code).toBe(0);
          const [first, second] = [folderOf(root), folderOf(root, OTHER)];
          const chat = await opencodeRun(
            root,
            [
              shell(`node "${DIST}" enter ${CHANGE}`),
              delegate("SUBAGENTE-1", "Entra en el otro cambio"),
              shell("pwd"),
            ],
            {
              "SUBAGENTE-1": [
                shell(`node "${DIST}" enter ${OTHER}`),
                write(OTHER_SPEC, "# Plan del otro\n"),
                shell("pwd"),
              ],
            },
          );
          const [entered, delegated, ran] = chat.results();
          const [subagentEntered, written, subagentRan] = chat.subagentResults("SUBAGENTE-1");
          expect(entered).toContain(`Esta conversación trabaja ahora en \`${first}\``);
          expect(subagentEntered).toContain(`Esta conversación trabaja ahora en \`${second}\``);
          expect(written).not.toMatch(/SIGUIENTE: |rejected|denied/i);
          expect(await read(second, OTHER_SPEC)).toBe("# Plan del otro\n");
          expect(existsSync(join(root, OTHER_SPEC))).toBe(false);
          expect(subagentRan).toContain(second);
          // Once the subagent is done, its session still works in the folder it had entered.
          expect(ran).toContain(first);
          expect(ran).not.toContain(second);
          // The subagent's binding is its child session's: the id `subagent` answers with.
          const child = /<subagent sessionID="([\w-]+)"/.exec(delegated ?? "")?.[1] ?? "";
          const bound = await bindings(root);
          expect(bound[child]).toBe(second);
          expect(Object.values(bound).toSorted()).toEqual([first, second].toSorted());
        },
      );
    });

    it("brings the card back in the request after a compaction (AC4)", LONG, async () => {
      const root = await implementing();
      const chat = await fakeChat([]);
      const opencode = await served(root, chat);
      // OpenCode 2 gets the card among the system parts of its next model call (ARCHITECTURE §10).
      const card = () =>
        (chat.requests().at(-1) ?? []).some(
          ({ role, text }) => role === "system" && text.includes("TAREA T1"),
        );
      try {
        await opencode.say("Sigue el guion.");
        expect(card()).toBe(false);
        await opencode.compact();
        await opencode.say("¿Y ahora?");
        expect(card()).toBe(true);
      } finally {
        opencode.close();
        await chat.close();
      }
    });

    it(
      "sends the agent back to work while specty check --changed fails, once (AC5)",
      LONG,
      async () => {
        const root = await initialized("checks:\n  levels: { secrets: off }\n  preCommit: true\n");
        expect((await cli(root, ["check", "--install"], { terminal: person() })).code).toBe(0);
        await writeFiles(root, {
          "src/app.ts": `export const greet = () => 'hola';\n// ${TODO}: later\n`,
        });
        const chat = await fakeChat([]);
        const opencode = await served(root, chat);
        const report = (messages: readonly { role: string; text: string }[]) =>
          messages.some(({ role, text }) => role === "user" && text.includes("FALLA todo"));
        try {
          await opencode.say("Sigue el guion.");
          await vi.waitFor(() => expect(chat.requests().some(report)).toBe(true), {
            timeout: 60_000,
            interval: 250,
          });
          // The turn it sent back may end: no third turn comes.
          await new Promise((resolve) => setTimeout(resolve, 5_000));
          expect(chat.requests()).toHaveLength(2);
        } finally {
          opencode.close();
          await chat.close();
        }
      },
    );
  },
);
