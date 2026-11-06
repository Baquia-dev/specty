// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  analyzeShell,
  DEFAULT_CONFIG,
  decideGuard,
  type GuardAction,
  type GuardChange,
  type GuardContext,
  type ShellFacts,
} from "../../src";

const ID = "20261021-x";
const change = (waiting: boolean): GuardChange => ({
  id: ID,
  kind: "standard",
  phase: waiting ? "review" : "implementing",
  closingSubmitted: false,
  specPath: `.specty/changes/${ID}/spec.md`,
  waiting,
});
const ctx = (extra: Partial<GuardContext> = {}): GuardContext => ({
  config: DEFAULT_CONFIG,
  lang: "es",
  command: "specty",
  tool: "claude-code",
  ...extra,
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

const BACKGROUND_ES =
  "Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.";
const BACKGROUND_EN =
  "Run it in the background (`run_in_background: true`), which tells you when it ends, and run it again each time it times out or is cut off.";

describe("the shell analysis of `sleep`", () => {
  it("AC2: finds `sleep` in any simple command, also inside loops, groups and wrappers", () => {
    for (const command of [
      "sleep 30",
      "sleep 5 && specty status",
      "specty status; sleep 10",
      "while true; do specty status; sleep 10; done",
      "until specty status | grep -q aprobada; do sleep 5; done",
      "if true; then sleep 1; fi",
      "{ sleep 1; }",
      "(sleep 1)",
      "! sleep 1",
      "nohup sleep 60 &",
      "FOO=1 sleep 2",
      "env FOO=1 sleep 2",
      "time sleep 2",
      "/bin/sleep 2",
    ]) {
      expect(analyzeShell(command).sleeps, command).toBe(true);
    }
  });

  it("AC2: does not take a mention of `sleep` for running it", () => {
    for (const command of [
      "specty status",
      "specty next",
      "specty wait",
      'echo "sleep 5"',
      "grep -r sleep src",
      "cat sleep.txt",
      "git commit -m sleep",
      "ls # sleep 5",
    ]) {
      expect(analyzeShell(command).sleeps, command).toBe(false);
    }
  });
});

describe("the guard's rule for `specty wait` in the foreground", () => {
  it("AC1: rejects `specty wait` the tool runs in the foreground and asks for the background", () => {
    for (const current of [undefined, change(true), change(false)]) {
      const context = ctx(current === undefined ? {} : { change: current });
      const denied = decideGuard(shell({ specty: ["wait"], background: false }), context);
      expect(denied).toEqual({
        allow: false,
        rule: "wait",
        reason:
          "`specty wait` espera la decisión de la persona, que puede tardar más que el límite de un comando en primer plano.",
        next: `lanza de nuevo \`specty wait\` para esperar su decisión. ${BACKGROUND_ES}`,
      });
    }
    const chained = shell({ specty: ["status", "wait"], background: false });
    expect(decideGuard(chained, ctx({ change: change(true) })).allow).toBe(false);
  });

  it("AC1: lets `specty wait` through in the background, and other commands in the foreground", () => {
    const waiting = ctx({ change: change(true) });
    expect(decideGuard(shell({ specty: ["wait"], background: true }), waiting).allow).toBe(true);
    for (const specty of [["next"], ["status"], ["task"]]) {
      expect(decideGuard(shell({ specty, background: false }), waiting).allow, specty[0]).toBe(
        true,
      );
    }
    // A tool whose shell does not say where the command runs keeps its own way of waiting.
    for (const tool of ["codex", "cursor", "opencode"] as const) {
      const other = ctx({ tool, change: change(true) });
      expect(decideGuard(shell({ specty: ["wait"] }), other).allow, tool).toBe(true);
    }
  });

  it("AC4: says it in English too", () => {
    const denied = decideGuard(
      shell({ specty: ["wait"], background: false }),
      ctx({ lang: "en", change: change(true) }),
    );
    expect(denied).toEqual({
      allow: false,
      rule: "wait",
      reason:
        "`specty wait` waits for the person's decision, which can take longer than the limit of a command in the foreground.",
      next: `launch \`specty wait\` again to wait for their decision. ${BACKGROUND_EN}`,
    });
  });
});

describe("the guard's rule for `sleep`", () => {
  it("AC2: rejects `sleep` while the change waits for the person and asks for `specty wait`", () => {
    const denied = decideGuard(shell({ sleeps: true }), ctx({ change: change(true) }));
    expect(denied).toEqual({
      allow: false,
      rule: "wait",
      reason: `El cambio ${ID} espera la decisión de la persona: no se espera con \`sleep\`.`,
      next: `ejecuta \`specty wait\` para esperar su decisión. ${BACKGROUND_ES}`,
    });
    // In the way of each tool, and in the foreground without one.
    const codex = decideGuard(
      shell({ sleeps: true }),
      ctx({ tool: "codex", change: change(true) }),
    );
    expect(codex).toMatchObject({
      allow: false,
      next: "ejecuta `specty wait` para esperar su decisión. Si sigue en marcha, consulta su salida hasta que termine, y vuelve a ejecutarlo cada vez que se agote o se corte.",
    });
    const { tool: _, ...unknown } = ctx({ change: change(true) });
    expect(decideGuard(shell({ sleeps: true }), unknown)).toMatchObject({
      allow: false,
      next: "ejecuta `specty wait` para esperar su decisión. Ejecútalo en primer plano y vuelve a ejecutarlo cada vez que se agote o se corte.",
    });
  });

  it("AC2: in delegated mode, asks for `specty next` instead", () => {
    const delegated = ctx({ change: change(true), delegated: true });
    expect(decideGuard(shell({ sleeps: true }), delegated)).toEqual({
      allow: false,
      rule: "wait",
      reason: `El cambio ${ID} espera la decisión de la persona: no se espera con \`sleep\`.`,
      next: "ejecuta `specty next`, que te dice si decides tú o esperas a la persona.",
    });
  });

  it("AC2: lets `sleep` through when nothing waits for the person, and `status` or `next` while it waits", () => {
    expect(decideGuard(shell({ sleeps: true }), ctx()).allow).toBe(true);
    expect(decideGuard(shell({ sleeps: true }), ctx({ change: change(false) })).allow).toBe(true);
    const waiting = ctx({ change: change(true) });
    for (const specty of [["status"], ["next"]]) {
      expect(decideGuard(shell({ specty, sleeps: false }), waiting).allow, specty[0]).toBe(true);
    }
  });

  it("AC4: says it in English too", () => {
    const en = (extra: Partial<GuardContext>) =>
      decideGuard(shell({ sleeps: true }), ctx({ lang: "en", change: change(true), ...extra }));
    expect(en({})).toEqual({
      allow: false,
      rule: "wait",
      reason: `Change ${ID} is waiting for the person's decision: do not wait with \`sleep\`.`,
      next: `run \`specty wait\` to wait for their decision. ${BACKGROUND_EN}`,
    });
    expect(en({ delegated: true })).toMatchObject({
      allow: false,
      next: "run `specty next`, which tells you whether you decide or wait for the person.",
    });
  });
});
