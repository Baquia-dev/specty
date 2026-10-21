// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  decideGuard,
  type GuardAction,
  type GuardChange,
  type GuardContext,
  type ShellFacts,
} from "../../src";

const SPEC = ".specty/changes/20261021-x/spec.md";
const change = (phase: GuardChange["phase"], task?: GuardChange["task"]): GuardChange => ({
  id: "20261021-x",
  kind: "standard",
  phase,
  closingSubmitted: false,
  specPath: SPEC,
  ...(task !== undefined ? { task } : {}),
});
const ctx = (current?: GuardChange): GuardContext => ({
  config: DEFAULT_CONFIG,
  lang: "es",
  command: "specty",
  ...(current !== undefined ? { change: current } : {}),
});
const write = (...paths: string[]): GuardAction => ({ kind: "write", paths });
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
const allowed = (action: GuardAction, context: GuardContext) => decideGuard(action, context).allow;
const IMPLEMENTING = change("implementing", {
  id: "T1",
  files: ["src/a.ts"],
  extras: ["src/extra.ts"],
});

describe("decideGuard on files", () => {
  it("requires a change before governed code", () => {
    expect(allowed(write("src/a.ts"), ctx())).toBe(false);
    expect(allowed(write("README.md", "docs/guide.md"), ctx())).toBe(true);
  });

  it("protects Specty's files and the hook configurations", () => {
    for (const path of [
      ".specty/config.yaml",
      ".specty/changes/20261021-x/state.json",
      ".claude/settings.json",
      ".git/hooks/pre-commit",
    ]) {
      expect(allowed(write(path), ctx(IMPLEMENTING)), path).toBe(false);
    }
  });

  it("lets the agent edit the spec only while the phase allows it", () => {
    expect(allowed(write(SPEC), ctx(change("draft")))).toBe(true);
    expect(allowed(write(SPEC), ctx(change("adjusting")))).toBe(true);
    expect(allowed(write(SPEC), ctx(IMPLEMENTING))).toBe(false);
    expect(allowed({ kind: "delete", paths: [SPEC] }, ctx(change("draft")))).toBe(false);
  });

  it("opens code only within the active task's scope", () => {
    expect(allowed(write("src/a.ts"), ctx(change("review")))).toBe(false);
    expect(allowed(write("src/a.ts"), ctx(change("implementing")))).toBe(false);
    expect(allowed(write("src/a.ts", "src/extra.ts", "src/a.test.ts"), ctx(IMPLEMENTING))).toBe(
      true,
    );
    const denied = decideGuard(write("src/b.ts"), ctx(IMPLEMENTING));
    expect(denied).toMatchObject({ allow: false });
    if (!denied.allow) expect(denied.next).toContain("specty scope add src/b.ts --task T1");
  });
});

describe("decideGuard on shell commands", () => {
  it("blocks human actions, the unrelated package and hook bypasses", () => {
    expect(allowed(shell({ specty: ["approve"] }), ctx(IMPLEMENTING))).toBe(false);
    expect(allowed(shell({ specty: ["next", "propose"] }), ctx(IMPLEMENTING))).toBe(true);
    expect(allowed(shell({ unscopedNpx: true }), ctx())).toBe(false);
    expect(allowed(shell({ bypass: true }), ctx())).toBe(false);
  });

  it("blocks commits of governed code but not of documentation", () => {
    const denied = decideGuard(shell({ committedGoverned: ["src/a.ts"] }), ctx(IMPLEMENTING));
    expect(denied.allow).toBe(false);
    if (!denied.allow) expect(denied.next).toContain("specty task done T1");
    expect(allowed(shell({ committedGoverned: [] }), ctx())).toBe(true);
  });

  it("applies the file rules to what the command writes", () => {
    expect(allowed(shell({ writes: ["src/b.ts"] }), ctx(IMPLEMENTING))).toBe(false);
    expect(
      allowed(shell({ writes: ["src/a.ts"], deletes: ["src/extra.ts"] }), ctx(IMPLEMENTING)),
    ).toBe(true);
  });

  it("answers in the project's language", () => {
    const english = decideGuard(write("src/a.ts"), { ...ctx(), lang: "en" });
    if (!english.allow) expect(english.reason).toContain("There is no active change");
  });
});
