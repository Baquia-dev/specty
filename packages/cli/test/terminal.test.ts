// SPDX-License-Identifier: Apache-2.0
import { detectAgentTool } from "@baquia-dev/specty-core";
import { afterEach, describe, expect, it } from "vitest";
import { hookTerminal } from "../src/enforce/entry";
import { systemTerminal } from "../src/terminal";
import { testEnv } from "./support";

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
