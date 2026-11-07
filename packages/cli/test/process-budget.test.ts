// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { budgetedEnv, processBudget } from "../src/flow/process-budget";
import type { Session } from "../src/session";
import { sessionAt } from "./server/support";
import { AGENT, APP, CONFIG, tempRepo } from "./support";

/** Two variables of the test's own, not those of who runs it, and `memoryMiB`, the size of a process. */
const processes = (memoryMiB: number) =>
  `${CONFIG()}  processes:\n    env: ["PROCESOS_A", "PROCESOS_B"]\n    memoryMiB: ${memoryMiB}\n`;

/** The configuration with both variables and 1 MiB a process: the memory never lowers the number. */
const WITH = processes(1);

/** A configuration whose processes are so big that not even one fits in any machine's memory. */
const HUGE = processes(1_000_000_000);

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

/** No memory limit: the number is the cores' alone. */
const ROOMY = { memory: Number.POSITIVE_INFINITY, memoryMiB: 512 };

/** This machine's cores, and those of a task's verification with the default 2 places. */
const CORES = availableParallelism();
const TASK = Math.max(1, Math.floor(CORES / 2));

/** A session in a repository with `config`, whose environment also holds `env`. */
async function sessionWith(config: string, env: Record<string, string> = {}): Promise<Session> {
  const opened = await sessionAt(await tempRepo({ ...APP, ".specty/config.yaml": config }), AGENT);
  const environment = { ...opened.environment, env: { ...opened.environment.env, ...env } };
  return { ...opened, environment };
}

/** 7.25 GiB, in 16 KiB pages. */
const SEVEN = 475_136 * 16_384;

/**
 * The environment in which the memory available is 7.25 GiB: `process.availableMemory()` says so
 * and, on macOS, the `PATH` starts with a `vm_stat` that says so too.
 */
async function sevenGiB(): Promise<Record<string, string>> {
  vi.spyOn(process, "availableMemory").mockReturnValue(SEVEN);
  if (process.platform !== "darwin") return {};
  const bin = await mkdtemp(join(tmpdir(), "specty-vm-stat-"));
  const lines = [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages free:                                   475136.",
    "Pages purgeable:                                   0.",
    "File-backed pages:                                 0.",
  ];
  await writeFile(
    join(bin, "vm_stat"),
    `#!/bin/sh\nprintf '%s\\n' ${lines.map((line) => `'${line}'`).join(" ")}\n`,
  );
  await chmod(join(bin, "vm_stat"), 0o755);
  return { PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` };
}

/** `session`, whose error output goes to `heard` instead. */
function hearing(session: Session): { readonly session: Session; readonly heard: string[] } {
  const heard: string[] = [];
  const io = { ...session.environment.io, err: (text: string) => void heard.push(text) };
  return { session: { ...session, environment: { ...session.environment, io } }, heard };
}

/** `count` and its noun, in the singular for 1. */
const many = (count: number, one: string, other: string) => `${count} ${count === 1 ? one : other}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the processes a verification command may start", () => {
  it("AC1: are the cores of its share of the places, rounded down and never fewer than 1", () => {
    expect(processBudget({ ...ROOMY, cores: 14, places: 1, slots: 2 })).toBe(7);
    expect(processBudget({ ...ROOMY, cores: 15, places: 1, slots: 2 })).toBe(7);
    expect(processBudget({ ...ROOMY, cores: 14, places: 2, slots: 2 })).toBe(14);
    expect(processBudget({ ...ROOMY, cores: 14, places: Number.POSITIVE_INFINITY, slots: 2 })).toBe(
      14,
    );
    expect(processBudget({ ...ROOMY, cores: 14, places: 1, slots: 3 })).toBe(4);
    expect(processBudget({ ...ROOMY, cores: 8, places: 1, slots: 1 })).toBe(8);
    expect(processBudget({ ...ROOMY, cores: 1, places: 1, slots: 2 })).toBe(1);
    expect(processBudget({ ...ROOMY, cores: 3, places: 1, slots: 4 })).toBe(1);
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

  it("AC1: are, when its share of the memory does not reach, the processes of memoryMiB that fit in it, and never fewer than 1", () => {
    const share = { cores: 14, slots: 2, memoryMiB: 512 };
    expect(processBudget({ ...share, places: 1, memory: 7.25 * GIB })).toBe(7);
    expect(processBudget({ ...share, places: Number.POSITIVE_INFINITY, memory: 7.25 * GIB })).toBe(
      14,
    );
    expect(processBudget({ ...share, places: 1, memory: 6.73 * GIB })).toBe(6);
    expect(processBudget({ ...share, places: Number.POSITIVE_INFINITY, memory: 6.73 * GIB })).toBe(
      13,
    );
    expect(processBudget({ ...share, places: 1, memory: 2 * GIB })).toBe(2);
    expect(processBudget({ ...share, places: 2, memory: 2 * GIB })).toBe(4);
    expect(processBudget({ ...share, places: 1, memory: 1.99 * GIB })).toBe(1);
    expect(processBudget({ ...share, places: 1, memory: 512 * MIB })).toBe(1);
    expect(processBudget({ ...share, places: 2, memory: 0 })).toBe(1);
    expect(processBudget({ ...share, places: 2, memoryMiB: 1024, memory: 4 * GIB })).toBe(4);
    expect(
      processBudget({ cores: 14, places: 1, slots: 3, memoryMiB: 256, memory: 2.5 * GIB }),
    ).toBe(3);
    expect(
      processBudget({ cores: 8, places: 1, slots: 1, memoryMiB: 512, memory: 1.5 * GIB }),
    ).toBe(3);
  });

  it("AC1: puts in each variable the processes that fit in the memory available as the command starts", async () => {
    const session = await sessionWith(processes(1024), await sevenGiB());
    // 7.25 GiB: 3.625 for a task's place, where 3 processes of 1 GiB fit, and 7 for the full one.
    const task = await budgetedEnv(session, 1);
    expect([task.PROCESOS_A, task.PROCESOS_B]).toEqual(Array(2).fill(String(Math.min(TASK, 3))));
    const full = await budgetedEnv(session, Number.POSITIVE_INFINITY);
    expect([full.PROCESOS_A, full.PROCESOS_B]).toEqual(Array(2).fill(String(Math.min(CORES, 7))));
  });

  it("AC1: puts 1 in each variable when not even one process of memoryMiB fits", async () => {
    const session = await sessionWith(HUGE);
    for (const places of [1, Number.POSITIVE_INFINITY]) {
      const env = await budgetedEnv(session, places);
      expect([env.PROCESOS_A, env.PROCESOS_B]).toEqual(["1", "1"]);
    }
  });
});

describe("the line a verification's command says as it starts", () => {
  it("AC1: tells on the error output the number, the variables, the memory, the cores and the places of a task and of the full one", async () => {
    const { session, heard } = hearing(await sessionWith(processes(1024), await sevenGiB()));
    // 7.25 GiB: 3 processes of 1 GiB for a task's place, 7 for the full one.
    await budgetedEnv(session, 1);
    await budgetedEnv(session, Number.POSITIVE_INFINITY);
    const task = many(Math.min(TASK, 3), "proceso", "procesos");
    const full = many(Math.min(CORES, 7), "proceso", "procesos");
    const cores = many(CORES, "núcleo", "núcleos");
    expect(heard).toEqual([
      `specty: ${task} en PROCESOS_A y PROCESOS_B (7,3 GB de memoria disponible, ${cores}, 1 de 2 plazas)`,
      `specty: ${full} en PROCESOS_A y PROCESOS_B (7,3 GB de memoria disponible, ${cores}, 2 de 2 plazas)`,
    ]);
  });

  it("AC1: tells it in English when Specty speaks English", async () => {
    const config = processes(1024).replace("language: es", "language: en");
    const { session, heard } = hearing(await sessionWith(config, await sevenGiB()));
    await budgetedEnv(session, Number.POSITIVE_INFINITY);
    const full = many(Math.min(CORES, 7), "process", "processes");
    const cores = many(CORES, "core", "cores");
    expect(heard).toEqual([
      `specty: ${full} in PROCESOS_A and PROCESOS_B (7.3 GB of memory available, ${cores}, 2 of 2 places)`,
    ]);
  });

  it("AC2: names apart a variable that keeps the smaller positive whole number of its environment", async () => {
    const { session, heard } = hearing(await sessionWith(WITH, { PROCESOS_A: "1" }));
    await budgetedEnv(session, Number.POSITIVE_INFINITY);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toContain(
      `specty: ${CORES} procesos en PROCESOS_B; se queda con el de su entorno: PROCESOS_A=1 (`,
    );
    expect(heard[0]).toMatch(/ \(\d+,\d GB de memoria disponible, /);
  });

  it("AC3: says nothing without variables in verify.processes.env", async () => {
    for (const config of [CONFIG(), `${CONFIG()}  processes:\n    env: []\n`]) {
      const { session, heard } = hearing(await sessionWith(config, { PROCESOS_A: "999" }));
      for (const places of [1, Number.POSITIVE_INFINITY]) await budgetedEnv(session, places);
      expect(heard).toEqual([]);
    }
  });
});
