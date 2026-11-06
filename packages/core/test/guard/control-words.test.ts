// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  analyzeShell,
  DEFAULT_CONFIG,
  decideGuard,
  type GuardAction,
  type GuardContext,
} from "../../src";

const ctx: GuardContext = {
  config: DEFAULT_CONFIG,
  lang: "es",
  command: "specty",
  change: {
    id: "20261021-x",
    kind: "standard",
    phase: "implementing",
    closingSubmitted: false,
    specPath: ".specty/changes/20261021-x/spec.md",
    task: { id: "T1", files: ["src/a.ts"], extras: [] },
  },
};
const shell = (command: string): GuardAction => ({
  kind: "shell",
  facts: {
    specty: analyzeShell(command).specty,
    unscopedNpx: false,
    bypass: false,
    committedGoverned: [],
    writes: [],
    deletes: [],
  },
});

describe("analyzeShell after the words that open a compound command or one of its branches", () => {
  it("reads the person's commands after `then`, `else`, `elif`, `do`, `{` and `!`", () => {
    for (const [command, specty] of [
      ["if true; then specty approve; fi", ["approve"]],
      ["while true; do specty accept; done", ["accept"]],
      ["until false; do FOO=1 sudo specty close; done", ["close"]],
      ["{ specty cancel; }", ["cancel"]],
      ["! specty reject", ["reject"]],
      ["if ! specty approve; then echo x; fi", ["approve"]],
      ["if specty status; then :; else specty approve; fi", ["status", "approve"]],
      ["if false; then :; elif true; then specty accept; fi", ["accept"]],
      ["for x in a b; do npx -y @baquia-dev/specty close; done", ["close"]],
    ] as const) {
      expect(analyzeShell(command).specty, command).toEqual(specty);
    }
  });

  it("lets the guard refuse the person's command inside a compound command", () => {
    expect(decideGuard(shell("if true; then specty approve; fi"), ctx)).toMatchObject({
      allow: false,
      rule: "human",
    });
    expect(decideGuard(shell("{ specty accept; }"), ctx)).toMatchObject({
      allow: false,
      rule: "human",
    });
  });

  it("reads the commits, hook bypasses and branches of `git` after those words", () => {
    expect(analyzeShell("if true; then git commit -m x; fi").commits).toEqual([{ all: false }]);
    expect(analyzeShell("{ git commit -am x; }").commits).toEqual([{ all: true }]);
    expect(analyzeShell("while true; do git commit -m x; done").commits).toEqual([{ all: false }]);
    expect(analyzeShell("if true; then git commit --no-verify -m x; fi").bypass).toBe(true);
    expect(analyzeShell("{ HUSKY=0 git commit -m x; }").bypass).toBe(true);
    expect(analyzeShell("! git -c core.hooksPath=/dev/null commit -m x").bypass).toBe(true);
    expect(analyzeShell("if true; then git branch -D feature; fi").refs).toContain("feature");
    expect(analyzeShell("{ git worktree remove .worktrees/a; }").worktreeRemovals).toEqual([
      { name: ".worktrees/a", path: ".worktrees/a" },
    ]);
  });

  it("reads the files written or removed in `.git` after those words", () => {
    expect(analyzeShell("if true; then touch .git/hooks/pre-commit; fi").writes).toEqual([
      ".git/hooks/pre-commit",
    ]);
    expect(analyzeShell("{ cp hook .git/hooks/pre-commit; }").writes).toEqual([
      ".git/hooks/pre-commit",
    ]);
    expect(analyzeShell("while true; do sed -i.bak s/a/b/ .git/config; done").writes).toEqual([
      ".git/config",
    ]);
    expect(analyzeShell("{ rm -rf .git/hooks; }").deletes).toEqual([".git/hooks"]);
    const moved = analyzeShell("if true; then mv a .git/b; fi");
    expect([moved.writes, moved.deletes]).toEqual([[".git/b"], ["a"]]);
  });

  it("reads `npx specty`, `specty new` and `specty enter` after those words", () => {
    expect(analyzeShell("if true; then npx specty next; fi").unscopedNpx).toBe(true);
    expect(analyzeShell('{ specty new "Saludo"; }').news).toEqual([{ subagent: false }]);
    expect(analyzeShell("then specty enter 20261026-saludo").enters).toEqual(["20261026-saludo"]);
  });

  it("follows the `cd` after those words, like a `cd` on its own", () => {
    expect(analyzeShell("{ cd sub && git commit -m x; }").commits).toEqual([
      { all: false, directory: "sub" },
    ]);
    expect(analyzeShell("if true; then cd /tmp/other; fi; touch f").writes).toEqual([
      "/tmp/other/f",
    ]);
    expect(analyzeShell("while true; do cd /w/x && pnpm test; done").runsIn).toEqual(["", "/w/x"]);
  });

  it("does not take the words that close a block for a command that runs somewhere", () => {
    expect(analyzeShell("{ cd /fuera; }").runsIn).toEqual([]);
    expect(analyzeShell("if true; then cd /fuera; fi").runsIn).toEqual([""]);
    expect(analyzeShell("for x in a b; do cd /fuera; done").runsIn).toEqual([""]);
    expect(analyzeShell("while true; do { cd /fuera; }; done").runsIn).toEqual([""]);
    expect(analyzeShell("case x in a) cd /fuera;; esac").runsIn).toEqual([""]);
    expect(analyzeShell("{ cd /fuera; } 2>/dev/null").runsIn).toEqual([]);
  });

  it("still counts a real command after the word that closes a block", () => {
    expect(analyzeShell("if true; then cd /fuera; fi; pnpm test").runsIn).toEqual(["", "/fuera"]);
    expect(analyzeShell("{ cd /fuera; } && ls").runsIn).toEqual(["/fuera"]);
    expect(analyzeShell("for x in a; do cd /fuera; done | tee log").runsIn).toEqual(["", "/fuera"]);
    expect(analyzeShell("echo fi").runsIn).toEqual([""]);
    expect(analyzeShell("cd /fuera; fi_tool").runsIn).toEqual(["/fuera"]);
  });

  it("still reads the redirections of the word that closes a block", () => {
    expect(analyzeShell("{ echo x; } > .git/hooks/pre-commit").writes).toEqual([
      ".git/hooks/pre-commit",
    ]);
    expect(analyzeShell("if true; then echo x; fi >> .git/config").writes).toEqual([".git/config"]);
  });

  it("does not take those words for control words when they are arguments", () => {
    for (const command of [
      "echo then specty approve",
      "echo do specty accept",
      'grep -rn "then specty approve" src',
      "if true; then echo specty approve; fi",
      "ls # then specty approve",
    ]) {
      const analysis = analyzeShell(command);
      expect(analysis.specty, command).toEqual([]);
      expect(decideGuard(shell(command), ctx).allow, command).toBe(true);
    }
    expect(analyzeShell("echo do git commit -m x").commits).toEqual([]);
    expect(analyzeShell("git commit -m then").commits).toEqual([{ all: false }]);
    expect(analyzeShell("echo { rm -rf .git").deletes).toEqual([]);
    expect(analyzeShell("echo then touch .git/x").writes).toEqual([]);
    expect(analyzeShell("echo then cd /tmp && touch f").writes).toEqual(["f"]);
    expect(analyzeShell("echo ! npx specty next").unscopedNpx).toBe(false);
  });
});
