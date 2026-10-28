// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DEFAULT_CONFIG, isIntegrating, parseChangeState, resolveConfig } from "../../src";

/** The example of docs/formats.md §6. */
const CONFIG_EXAMPLE = `
version: 1
language: es
mode: individual
governed: ["lib/**", "test/**"]
ignored: ["**/*.md", "docs/**", "assets/**"]
sensitive: ["lib/core/auth/**", "**/migrations/**", ".github/**"]
verify:
  default: flutter test
  full: flutter analyze && flutter test
  quick: dart format --output=none --set-exit-if-changed .
  timeoutSec: 600
scope:
  implicitTests: true
  generated: ["**/*.g.dart", "**/*.freezed.dart"]
  autoApprove: tests-and-generated
lanes:
  quick: { maxFiles: 3 }
split: { maxTasks: 8, maxFiles: 15, maxModules: 2, taskMaxFiles: 5 }
size: { S: 4, M: 10, L: 18 }
policy:
  tests: recommended
retro:
  mode: agent
git:
  branchPerChange: true
  worktrees: true
  setup: flutter pub get
team:
  approvers: []
  requirePrReview: true
ui:
  port: auto
  requireUserPresence: false
`;

const HASH = `sha256:${"a".repeat(64)}`;

describe("resolveConfig", () => {
  it("accepts the documented example", () => {
    const result = resolveConfig(parse(CONFIG_EXAMPLE));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.verify.default).toBe("flutter test");
      expect(result.config.verify.quick).toBe("dart format --output=none --set-exit-if-changed .");
    }
  });

  it("fills in defaults", () => {
    const result = resolveConfig({ version: 1, split: { maxTasks: 5 } });
    expect(result).toEqual({
      ok: true,
      config: { ...DEFAULT_CONFIG, split: { ...DEFAULT_CONFIG.split, maxTasks: 5 } },
    });
  });

  it("puts each change in a worktree unless told otherwise, prepared as configured", () => {
    expect(DEFAULT_CONFIG.git).toEqual({ branchPerChange: true, worktrees: true });
    const configured = (git: unknown) => {
      const result = resolveConfig({ version: 1, git });
      return result.ok ? result.config.git : undefined;
    };
    expect(configured({ worktrees: false, setup: false })).toEqual({
      branchPerChange: true,
      worktrees: false,
      setup: false,
    });
    expect(configured({ setup: "pnpm install --offline" })).toMatchObject({
      worktrees: true,
      setup: "pnpm install --offline",
    });
    expect(configured({ setup: "" })).toBeUndefined();
    expect(configured({ setup: true })).toBeUndefined();
  });

  it("takes an optional target branch", () => {
    const target = (git: unknown) => {
      const result = resolveConfig({ version: 1, git });
      return result.ok ? result.config.git.target : "invalid";
    };
    expect(target({ target: "develop" })).toBe("develop");
    expect(target({})).toBeUndefined();
    expect(target({ target: "" })).toBe("invalid");
  });

  it("takes an optional flow that names the branches, and refuses an unknown one (AC3)", () => {
    const flow = (git: unknown) => {
      const result = resolveConfig({ version: 1, git });
      return result.ok ? result.config.git.flow : result.issues.map((issue) => issue.path);
    };
    expect(flow({ flow: "gitflow" })).toBe("gitflow");
    expect(flow({ flow: "trunk" })).toBe("trunk");
    // Unset, the branches keep Specty's own names.
    expect(flow({})).toBeUndefined();
    expect(flow({ flow: "svn" })).toEqual(["git.flow"]);
  });

  it("takes an optional branch pattern, and refuses one that gives no valid branches (AC2)", () => {
    const pattern = (git: unknown) => {
      const result = resolveConfig({ version: 1, git });
      return result.ok ? result.config.git.branchPattern : result.issues;
    };
    expect(pattern({ branchPattern: "team/{type}-{slug}" })).toBe("team/{type}-{slug}");
    expect(pattern({})).toBeUndefined();
    expect(pattern({ branchPattern: "{type}/fijo" })).toEqual([
      { path: "git.branchPattern", message: expect.stringContaining("{slug} or {id}") },
    ]);
    const empty = pattern({ branchPattern: "" });
    expect(Array.isArray(empty) && empty.map((issue) => issue.path)).toContain("git.branchPattern");
  });

  it("AC1: accepts the contract tests policy", () => {
    const resolved = resolveConfig({ version: 1, policy: { tests: "contract" } });
    expect(resolved.ok && resolved.config.policy.tests).toBe("contract");
  });

  it("reports unknown keys, bad values and inconsistent thresholds", () => {
    const issues = (input: unknown) => (resolveConfig(input).ok ? [] : ["invalid"]);
    expect(issues({ version: 1, colour: "blue" })).toEqual(["invalid"]);
    expect(issues({ version: 1, policy: { tests: "sometimes" } })).toEqual(["invalid"]);
    expect(issues({ version: 2 })).toEqual(["invalid"]);
    expect(resolveConfig({ version: 1, size: { S: 12 } })).toEqual({
      ok: false,
      issues: [{ path: "size", message: "Thresholds must grow: S < M < L." }],
    });
  });
});

describe("parseChangeState", () => {
  const state = {
    schema: 1,
    id: "20261020-evolucion-academica",
    kind: "standard",
    phase: "implementing",
    branch: "specty/20261020-evolucion-academica",
    baseCommit: "9f1c2e7",
    revision: 3,
    approved: {
      revision: 3,
      hash: HASH,
      at: "2026-10-20T15:02:11Z",
      by: "Jorge Palacio",
      channel: "ui",
    },
    size: {
      level: "M",
      score: 7,
      adjust: 0,
      reasons: ["3 archivos", "2 módulos", "sin tests en analytics"],
    },
    items: { A1: { hash: HASH, decision: "confirmed" }, A2: { hash: HASH, decision: "implicit" } },
    tasks: {
      T1: { status: "done", baseCommit: "9f1c2e7", commit: "a1b2c3d", attempts: 1, scopeExtra: [] },
      T2: { status: "active", baseCommit: "a1b2c3d", attempts: 0, scopeExtra: [] },
    },
    pending: {
      scopeRequests: [
        { id: "S1", task: "T2", paths: ["lib/core/theme/ca_colors.dart"], reason: "Tokens" },
      ],
      adjustment: null,
    },
    maxIds: { A: 2, AC: 2, T: 2, R: 1 },
  };

  it("accepts a valid state", () => {
    expect(parseChangeState(state).ok).toBe(true);
  });

  it("accepts a pending incorporation and tells it from a resolved one", () => {
    const integration = {
      target: "main",
      commit: "b4c5d6e",
      reason: "conflicts",
      conflicts: ["src/app.ts"],
      paths: ["src/app.ts", "src/other.ts"],
      at: "2026-10-23T15:02:11Z",
    };
    const pending = parseChangeState({ ...state, phase: "closing", integration });
    expect(pending.ok).toBe(true);
    if (pending.ok) expect(isIntegrating(pending.state)).toBe(true);
    const resolved = parseChangeState({
      ...state,
      integration: { ...integration, resolved: { commit: "c7d8e9f", at: "2026-10-23T15:10:00Z" } },
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(isIntegrating(resolved.state)).toBe(false);
    expect(isIntegrating({})).toBe(false);
    const wrong = parseChangeState({ ...state, integration: { ...integration, reason: "other" } });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.issues[0]).toMatch(/^integration\.reason/);
  });

  it("AC1: accepts a change in the testing phase", () => {
    expect(parseChangeState({ ...state, phase: "testing" }).ok).toBe(true);
  });

  it("AC1: keeps the hash of each approved test", () => {
    const locked = { ...state, lockedTests: { "test/a.test.ts": HASH } };
    expect(parseChangeState(locked).ok).toBe(true);
    expect(parseChangeState({ ...locked, lockedTests: { "test/a.test.ts": "x" } }).ok).toBe(false);
  });

  it("AC5: keeps when the tests were sent for approval", () => {
    const sent = { ...state, phase: "testing", testsSubmittedAt: "2026-10-28T10:00:00.000Z" };
    expect(parseChangeState(sent).ok).toBe(true);
    expect(parseChangeState({ ...sent, testsSubmittedAt: "ayer" }).ok).toBe(false);
  });

  it("rejects malformed states with readable issues", () => {
    const result = parseChangeState({ ...state, phase: "tested", revision: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.split(":")[0])).toEqual(["phase", "revision"]);
  });
});
