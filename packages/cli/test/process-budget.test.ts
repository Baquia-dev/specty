// SPDX-License-Identifier: Apache-2.0
import { availableParallelism } from "node:os";
import { describe, expect, it } from "vitest";
import { budgetedEnv, processBudget } from "../src/flow/process-budget";
import type { Session } from "../src/session";
import { sessionAt } from "./server/support";
import { AGENT, APP, CONFIG, tempRepo } from "./support";

/** The configuration with two variables of its own: the test's, not those of who runs it. */
const WITH = `${CONFIG()}  processes:\n    env: ["PROCESOS_A", "PROCESOS_B"]\n`;

/** This machine's cores, and those of a task's verification with the default 2 places. */
const CORES = availableParallelism();
const TASK = Math.max(1, Math.floor(CORES / 2));

/** A session in a repository with `config`, whose environment also holds `env`. */
async function sessionWith(config: string, env: Record<string, string> = {}): Promise<Session> {
  const opened = await sessionAt(await tempRepo({ ...APP, ".specty/config.yaml": config }), AGENT);
  const environment = { ...opened.environment, env: { ...opened.environment.env, ...env } };
  return { ...opened, environment };
}

describe("the processes a verification command may start", () => {
  it("AC1: are the cores of its share of the places, rounded down and never fewer than 1", () => {
    expect(processBudget({ cores: 14, places: 1, slots: 2 })).toBe(7);
    expect(processBudget({ cores: 15, places: 1, slots: 2 })).toBe(7);
    expect(processBudget({ cores: 14, places: 2, slots: 2 })).toBe(14);
    expect(processBudget({ cores: 14, places: Number.POSITIVE_INFINITY, slots: 2 })).toBe(14);
    expect(processBudget({ cores: 14, places: 1, slots: 3 })).toBe(4);
    expect(processBudget({ cores: 8, places: 1, slots: 1 })).toBe(8);
    expect(processBudget({ cores: 1, places: 1, slots: 2 })).toBe(1);
    expect(processBudget({ cores: 3, places: 1, slots: 4 })).toBe(1);
  });

  it("AC1: puts the same number in each variable, a task's share with one place and every core with all", async () => {
    const session = await sessionWith(WITH);
    const task = await budgetedEnv(session, 1);
    expect([task.PROCESOS_A, task.PROCESOS_B]).toEqual([String(TASK), String(TASK)]);
    const full = await budgetedEnv(session, Number.POSITIVE_INFINITY);
    expect([full.PROCESOS_A, full.PROCESOS_B]).toEqual([String(CORES), String(CORES)]);
    // The rest of the environment is the session's, which stays as it was.
    expect(full.PATH).toBe(session.environment.env.PATH);
    expect(full.LANG).toBe(session.environment.env.LANG);
    expect(session.environment.env.PROCESOS_A).toBeUndefined();
  });

  it("AC2: keeps a smaller positive whole number a variable already holds, and gives the number for any other value", async () => {
    const kept = await sessionWith(WITH, { PROCESOS_A: "1", PROCESOS_B: String(CORES + 1) });
    const full = await budgetedEnv(kept, Number.POSITIVE_INFINITY);
    expect([full.PROCESOS_A, full.PROCESOS_B]).toEqual(["1", String(CORES)]);
    for (const wrong of ["0", "", "-1", "1.5", "dos", "2x", String(CORES)]) {
      const session = await sessionWith(WITH, { PROCESOS_A: wrong });
      expect((await budgetedEnv(session, Number.POSITIVE_INFINITY)).PROCESOS_A, wrong).toBe(
        String(CORES),
      );
    }
  });

  it("AC3: without variables in verify.processes.env, gives the session's environment as it is", async () => {
    for (const config of [CONFIG(), `${CONFIG()}  processes:\n    env: []\n`]) {
      const session = await sessionWith(config, { PROCESOS_A: "999" });
      for (const places of [1, Number.POSITIVE_INFINITY]) {
        expect(await budgetedEnv(session, places)).toEqual(session.environment.env);
      }
    }
  });
});
