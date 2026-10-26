// SPDX-License-Identifier: Apache-2.0
import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type FakeChat, fakeChat, type ToolCall } from "./fake-chat";
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

/** OpenCode's CLI: `SPECTY_E2E_OPENCODE` or `opencode` on the PATH. Undefined: the tests skip. */
function findOpencode(): string | undefined {
  const configured = process.env.SPECTY_E2E_OPENCODE;
  if (configured !== undefined && configured.length > 0) return configured;
  const found = spawnSync("opencode", ["--version"], { encoding: "utf8" });
  return found.status === 0 ? "opencode" : undefined;
}

const OPENCODE = findOpencode();
/** Where OpenCode keeps the packages it installs: shared, so the tests download them once. */
const CACHE = join(tmpdir(), "specty-e2e-opencode-cache");
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
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    LANG: "es_ES.UTF-8",
  };
}

/** `opencode run` in `root` against a fake that plays `script`. */
async function opencodeRun(root: string, script: readonly ToolCall[]): Promise<FakeChat> {
  const chat = await fakeChat(script);
  const env = await isolated(chat);
  const args = ["run", "--dir", root, "--model", "fake/scripted", "Sigue el guion."];
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

/**
 * `opencode serve` in `root`, as OpenCode's interface runs it, with one session to talk to over
 * HTTP: the end of a turn and a compaction need a server that outlives the turn.
 */
async function served(root: string, chat: FakeChat) {
  const port = await freePort();
  const server = spawn(
    OPENCODE ?? "opencode",
    ["serve", "--port", String(port), "--hostname", "127.0.0.1"],
    { cwd: root, env: await isolated(chat), stdio: "ignore" },
  );
  const base = `http://127.0.0.1:${port}`;
  const request = async (path: string, body?: unknown): Promise<unknown> => {
    const init = body === undefined ? {} : { method: "POST", body: JSON.stringify(body) };
    const headers = { "content-type": "application/json" };
    return (await fetch(`${base}${path}`, { ...init, headers })).json();
  };
  await vi.waitFor(() => request("/session"), { timeout: 60_000, interval: 250 });
  const session = await request("/session", {});
  const id = typeof session === "object" && session !== null && "id" in session ? session.id : "";
  const model = { providerID: "fake", modelID: "scripted" };
  return {
    say: (text: string) =>
      request(`/session/${id}/message`, { parts: [{ type: "text", text }], model }),
    compact: () => request(`/session/${id}/summarize`, model),
    messages: async () => JSON.stringify(await request(`/session/${id}/message`)),
    close: () => server.kill(),
  };
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const write = (path: string, content: string): ToolCall => ({
  name: "write",
  arguments: { filePath: path, content },
});
const bash = (command: string): ToolCall => ({
  name: "bash",
  arguments: { command, description: "Sigue el guion" },
});

describe.skipIf(OPENCODE === undefined)(
  "OpenCode with a scripted model (needs OpenCode: SPECTY_E2E_OPENCODE or the PATH)",
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
          bash("git commit -am 'Sin spec'"),
          bash("specty approve"),
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
        bash(`node -e "require('fs').writeFileSync('src/otro.ts', 'x')"`),
      ]);
      expect(chat.results()[0]).toContain("`src/otro.ts` está fuera del alcance de T1.");
    });

    it("brings the card back in the request after a compaction (AC4)", LONG, async () => {
      const root = await implementing();
      const chat = await fakeChat([]);
      const opencode = await served(root, chat);
      try {
        await opencode.say("Sigue el guion.");
        await opencode.compact();
        await vi.waitFor(async () => expect(await opencode.messages()).toContain("TAREA T1"), {
          timeout: 60_000,
          interval: 250,
        });
        await opencode.say("¿Y ahora?");
        const after = chat.requests().at(-1) ?? [];
        expect(after.some(({ role, text }) => role === "user" && text.includes("TAREA T1"))).toBe(
          true,
        );
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
