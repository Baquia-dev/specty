// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  analyzeShell,
  DEFAULT_CONFIG,
  decideGuard,
  type GuardAction,
  type GuardContext,
  type ShellFacts,
} from "../../src";

const ctx = (branch = "specty-memory", lang: "es" | "en" = "es"): GuardContext => ({
  config: { ...DEFAULT_CONFIG, memory: { ...DEFAULT_CONFIG.memory, branch } },
  lang,
  command: "specty",
});

const shell = (facts: Partial<ShellFacts>): GuardAction => ({
  kind: "shell",
  facts: {
    specty: [],
    unscopedNpx: false,
    bypass: false,
    committedGoverned: [],
    writes: [],
    deletes: [],
    ...facts,
  },
});

const refs = (command: string) => analyzeShell(command).refs;

describe("the branches a git command writes", () => {
  it("AC1: name the branch moved, deleted or created by update-ref and branch", () => {
    for (const command of [
      "git update-ref refs/heads/specty-memory HEAD",
      "git update-ref -d refs/heads/specty-memory",
      "git update-ref heads/specty-memory abc123 def456",
      "git branch -D specty-memory",
      "git branch --delete specty-memory otra",
      "git branch -m specty-memory memoria-vieja",
      "git branch -f specty-memory HEAD",
      "git branch specty-memory",
      "git -C ../repo update-ref refs/heads/specty-memory HEAD",
      "cd ../repo && git branch -D specty-memory",
    ]) {
      expect(refs(command), command).toContain("specty-memory");
    }
  });

  it("AC1: name the branch pushed, checked out or fetched into", () => {
    for (const command of [
      "git push origin specty-memory",
      "git push origin :specty-memory",
      "git push origin +specty-memory:refs/heads/specty-memory",
      "git push origin main:specty-memory",
      "git push --delete origin specty-memory",
      "git switch specty-memory",
      "git switch -c specty-memory",
      "git checkout specty-memory",
      "git checkout -b specty-memory main",
      "git worktree add ../memoria specty-memory",
      "git worktree add -b specty-memory ../memoria",
      "git fetch origin specty-memory:specty-memory",
      "git fetch origin +refs/heads/specty-memory:refs/heads/specty-memory",
    ]) {
      expect(refs(command), command).toContain("specty-memory");
    }
  });

  it("AC1: count as every branch when they cannot be known or push them all", () => {
    for (const command of [
      "git update-ref --stdin",
      "git push --all origin",
      "git push --mirror",
    ]) {
      expect(refs(command), command).toContain("*");
    }
  });

  it("AC2: leave out the branch only read, and other branches", () => {
    for (const command of [
      "git log specty-memory",
      "git show specty-memory:README.md",
      "git diff main specty-memory",
      "git branch --list",
      "git branch -a",
      "git branch --contains specty-memory",
      "git branch nueva specty-memory",
      "git fetch origin specty-memory",
      "git push origin main",
      "git switch main",
      "git checkout -b nueva specty-memory",
      "git cat-file -p specty-memory:entries/P1.md",
      "ls specty-memory",
    ]) {
      const written = refs(command);
      expect(written, command).not.toContain("specty-memory");
      expect(written, command).not.toContain("*");
    }
  });
});

describe("the guard on the memory's branch", () => {
  it("AC1: blocks a command that writes it, and says what to use instead", () => {
    const decision = decideGuard(shell({ refs: ["specty-memory"] }), ctx());
    expect(decision).toEqual({
      allow: false,
      rule: "memory",
      reason:
        "La rama `specty-memory` es la memoria de Specty: solo la escriben los comandos de `specty memory`.",
      next: "anota con `specty memory add`, marca hecho con `specty memory done` o propón descartar con `specty memory drop`; subir la rama es cosa de la persona.",
    });
    const english = decideGuard(shell({ refs: ["specty-memory"] }), ctx("specty-memory", "en"));
    expect(english).toMatchObject({
      reason:
        "The `specty-memory` branch is Specty's memory: only the `specty memory` commands write it.",
      next: "add with `specty memory add`, mark done with `specty memory done` or propose dropping with `specty memory drop`; pushing the branch is the person's call.",
    });
  });

  it("AC1: blocks a command that touches every branch, and follows memory.branch", () => {
    expect(decideGuard(shell({ refs: ["*"] }), ctx()).allow).toBe(false);
    expect(decideGuard(shell({ refs: ["mi-memoria"] }), ctx("mi-memoria"))).toMatchObject({
      allow: false,
      rule: "memory",
    });
  });

  it("AC2: lets other branches through", () => {
    expect(decideGuard(shell({ refs: ["main", "feature"] }), ctx()).allow).toBe(true);
    expect(decideGuard(shell({ refs: ["specty-memory"] }), ctx("mi-memoria")).allow).toBe(true);
    expect(decideGuard(shell({}), ctx()).allow).toBe(true);
  });
});
