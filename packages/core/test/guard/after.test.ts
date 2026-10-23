// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  DELETED,
  decideAfterShell,
  type GuardChange,
  type GuardContext,
  type GuardDecision,
  shellChanges,
} from "../../src";

const SPEC = ".specty/changes/20261021-x/spec.md";
const change = (phase: GuardChange["phase"]): GuardChange => ({
  id: "20261021-x",
  kind: "standard",
  phase,
  closingSubmitted: false,
  specPath: SPEC,
  ...(phase === "implementing" ? { task: { id: "T1", files: ["src/a.ts"], extras: [] } } : {}),
});
const ctx = (current?: GuardChange, lang: GuardContext["lang"] = "es"): GuardContext => ({
  config: DEFAULT_CONFIG,
  lang,
  command: "specty",
  ...(current !== undefined ? { change: current } : {}),
});
const writes = (...paths: string[]) => ({ writes: paths, deletes: [] });
const text = (decision: GuardDecision) =>
  decision.allow ? "" : `${decision.reason}\nSIGUIENTE: ${decision.next}`;
const IMPLEMENTING = ctx(change("implementing"));

describe("shellChanges", () => {
  it("keeps only what changed during the command (AC2, AC3)", () => {
    const before = {
      "src/kept.ts": "10:1",
      "src/edited.ts": "10:1",
      "src/gone.ts": DELETED,
      "src/reverted.ts": "5:1",
    };
    const after = {
      "src/kept.ts": "10:1",
      "src/edited.ts": "12:2",
      "src/gone.ts": DELETED,
      "src/new.ts": "3:2",
      "src/removed.ts": DELETED,
    };
    expect(shellChanges(before, after)).toEqual({
      writes: ["src/edited.ts", "src/new.ts"],
      deletes: ["src/removed.ts"],
    });
    expect(shellChanges(after, after)).toEqual({ writes: [], deletes: [] });
  });

  it("reads names such as `constructor` as files", () => {
    expect(shellChanges({}, { constructor: "1:1" }).writes).toEqual(["constructor"]);
  });
});

describe("decideAfterShell", () => {
  it("lets through what the task may change (AC2)", () => {
    expect(decideAfterShell(writes("src/a.ts", "README.md"), IMPLEMENTING).allow).toBe(true);
    expect(decideAfterShell({ writes: [], deletes: [] }, ctx()).allow).toBe(true);
  });

  it("names what is outside the task and how to request it (AC1)", () => {
    const decision = decideAfterShell(
      { writes: ["src/other.ts"], deletes: ["src/old.ts"] },
      IMPLEMENTING,
    );
    expect(decision).toMatchObject({ allow: false, rule: "scope" });
    expect(text(decision)).toContain("El comando cambió lo que el flujo no permite ahora:");
    expect(text(decision)).toContain("`src/other.ts` está fuera del alcance de T1.");
    expect(text(decision)).toContain("`src/old.ts` está fuera del alcance de T1.");
    expect(text(decision)).toContain(
      'specty scope add src/other.ts src/old.ts --task T1 --reason "<motivo>"',
    );
    const english = decideAfterShell(writes("src/other.ts"), ctx(change("implementing"), "en"));
    expect(text(english)).toContain(
      'request the scope with `specty scope add src/other.ts --task T1 --reason "<reason>"`',
    );
  });

  it("applies the guard's other rules, without offering a scope (AC4)", () => {
    const cases: readonly [GuardContext, string, string][] = [
      [ctx(), "src/a.ts", "no-change"],
      [ctx(change("review")), "src/a.ts", "phase"],
      [IMPLEMENTING, ".specty/changes/20261021-x/state.json", "protected"],
      [IMPLEMENTING, SPEC, "spec"],
    ];
    for (const [context, path, rule] of cases) {
      const decision = decideAfterShell(writes(path), context);
      expect(decision, path).toMatchObject({ allow: false, rule });
      expect(text(decision)).toContain("deshazlos y ejecuta `specty next`");
      expect(text(decision)).not.toContain("scope add");
    }
  });

  it("offers a scope only for the files that can have one", () => {
    const decision = decideAfterShell(writes("src/other.ts", ".specty/config.yaml"), IMPLEMENTING);
    expect(text(decision)).toContain("`.specty/config.yaml` lo gestiona Specty");
    expect(text(decision)).toContain("specty scope add src/other.ts --task T1");
    expect(text(decision)).not.toContain("scope add src/other.ts .specty");
  });
});
