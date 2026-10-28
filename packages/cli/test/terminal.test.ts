// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_CONFIG, detectAgentTool } from "@baquia-dev/specty-core";
import { afterEach, describe, expect, it } from "vitest";
import { hookTerminal } from "../src/enforce/entry";
import { createGit } from "../src/io/git";
import { sessionFrom } from "../src/session";
import { repoPaths } from "../src/store/paths";
import { systemTerminal } from "../src/terminal";
import { AGENT, NOW, person, tempRepo, testEnv } from "./support";

const original = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY };

/** Makes stdin and stdout look like a real terminal, or not, as the person's or an agent's. */
function tty(stdin: boolean | undefined, stdout = stdin): void {
  Object.defineProperty(process.stdin, "isTTY", { value: stdin, configurable: true });
  Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true });
}

afterEach(() => tty(original.stdin, original.stdout));

const terminals = { system: systemTerminal, hooks: hookTerminal };

describe("who is at the terminal", () => {
  for (const [name, terminal] of Object.entries(terminals)) {
    it(`the ${name} terminal counts a real TTY as the person only without an agent's environment`, () => {
      tty(true);
      expect(terminal({}).interactive).toBe(true);
      expect(terminal({ CODEX_THREAD_ID: "019a" }).interactive).toBe(false);
      expect(terminal({ CLAUDECODE: "1" }).interactive).toBe(false);
      tty(true, false);
      expect(terminal({}).interactive).toBe(false);
      tty(undefined);
      expect(terminal({}).interactive).toBe(false);
    });
  }

  it("the tests' environment gives no agent away, even when they run inside one", () => {
    const saved = { ci: process.env.CODEX_CI, thread: process.env.CODEX_THREAD_ID };
    process.env.CODEX_CI = "1";
    process.env.CODEX_THREAD_ID = "019a";
    try {
      expect(detectAgentTool(testEnv())).toBeUndefined();
    } finally {
      for (const [key, value] of [
        ["CODEX_CI", saved.ci],
        ["CODEX_THREAD_ID", saved.thread],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("a question with several answers", () => {
  const options = [
    { value: "claude-code", label: "Claude Code" },
    { value: "codex", label: "Codex" },
  ];

  it("is not answered by the hooks' terminal, nor by an agent's shell in delegated mode", async () => {
    expect(await hookTerminal({}).chooseMany("¿Cuáles?", options, ["codex"])).toBeUndefined();
    const root = await tempRepo({ "README.md": "# App\n" });
    const environment = {
      cwd: root,
      env: testEnv(),
      now: () => NOW,
      terminal: AGENT,
      io: { out: () => undefined, err: () => undefined },
      invocation: { command: "specty", portable: true },
    };
    const git = createGit(root, environment.env);
    const session = sessionFrom(environment, root, repoPaths(root), git, DEFAULT_CONFIG, true);
    const { terminal } = session.environment;
    expect(await terminal.chooseMany("¿Cuáles?", options, ["codex"])).toBeUndefined();
  });

  it("is answered by the test person with what was checked, or the first option", async () => {
    expect(await person().chooseMany("¿Cuáles?", options, ["codex"])).toEqual(["codex"]);
    expect(await person().chooseMany("¿Cuáles?", options, [])).toEqual(["claude-code"]);
    const scripted = person({ chooseMany: [["codex", "claude-code", "otro"]] });
    // In the options' order, as the person's terminal gives them; what is not offered is dropped.
    expect(await scripted.chooseMany("¿Cuáles?", options, [])).toEqual(["claude-code", "codex"]);
    await expect(AGENT.chooseMany("¿Cuáles?", options, [])).rejects.toThrow();
  });
});
