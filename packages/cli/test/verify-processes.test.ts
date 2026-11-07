// SPDX-License-Identifier: Apache-2.0
import { rm } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { call, implemented, path, serving } from "./server/support";
import { APP, cli, person, read, SPEC, SPEC_PATH, tempRepo, writeFiles } from "./support";

/**
 * A verification that writes what its variables `PROCESOS_A` and `PROCESOS_B` hold to
 * `.git/procesos-<name>`: the test's own variables, not those of the verification that runs it.
 */
const writes = (name: string) =>
  `node -e "require('fs').writeFileSync('.git/procesos-${name}', process.env.PROCESOS_A + ' ' + process.env.PROCESOS_B)"`;

/** The configuration without `verify.processes`: a task's verification and the full one write. */
const BASE = `version: 1\nlanguage: es\ngit:\n  worktrees: false\nverify:\n  default: ${JSON.stringify(writes("tarea"))}\n  full: ${JSON.stringify(writes("completa"))}\n`;

/** The configuration that names both variables in `verify.processes.env`, with processes of `memoryMiB`. */
const processes = (memoryMiB: number) =>
  `${BASE}  processes:\n    env: ["PROCESOS_A", "PROCESOS_B"]\n    memoryMiB: ${memoryMiB}\n`;

/** Both variables, with 1 MiB a process: the memory of who runs the tests never lowers the number. */
const WITH = processes(1);

/** This machine's cores, and those of a task's verification with the default 2 places. */
const CORES = availableParallelism();
const TASK = Math.max(1, Math.floor(CORES / 2));

/** What both variables hold when each has `count`. */
const both = (count: number) => `${count} ${count}`;

/** SPEC's change, approved, with T1 active; `config`, its configuration. */
async function approved(config: string): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  return root;
}

/** Waits for `check` to hold, up to 30 s of real time. */
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 30_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((done) => setTimeout(done, 100));
  }
}

describe("the processes each verification command may start", () => {
  it("AC1: a task's verification gets half the cores in each variable, and accept's full one every core", async () => {
    const root = await approved(WITH);
    await writeFiles(root, { "src/app.ts": "1\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"])).code).toBe(0);
    expect(await read(root, ".git/procesos-tarea")).toBe(both(TASK));
    await writeFiles(root, { "src/app.ts": "2\n" });
    expect((await cli(root, ["task", "done", "T2", "--summary", "Dos"])).code).toBe(0);
    expect((await cli(root, ["accept"], { terminal: person() })).code).toBe(0);
    expect(await read(root, ".git/procesos-completa")).toBe(both(CORES));
  });

  it("AC1: specty verify --fresh gets every core, outside a change and in an open one", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": WITH });
    expect((await cli(root, ["verify", "--fresh"])).code).toBe(0);
    expect(await read(root, ".git/procesos-completa")).toBe(both(CORES));
    await rm(join(root, ".git", "procesos-completa"));
    expect((await cli(root, ["new", "Saludo personalizado"])).code).toBe(0);
    expect((await cli(root, ["verify", "--fresh"])).code).toBe(0);
    expect(await read(root, ".git/procesos-completa")).toBe(both(CORES));
  });

  it("AC1: the full verification the UI starts gets every core", async () => {
    const { root, server, headers } = await serving(true, WITH);
    try {
      await implemented(root, "1\n", "2\n");
      const started = await call(server.port, path("verify"), headers, {});
      expect(started.status).toBe(200);
      // Once it ends, the change has no run going on.
      await until(async () => (await call(server.port, path("run"), headers)).body === "null");
      expect(await read(root, ".git/procesos-completa")).toBe(both(CORES));
    } finally {
      await server.close();
    }
  });

  it("AC2: a variable that already holds a smaller positive whole number keeps it, and one with a bigger one gets the number", async () => {
    const root = await approved(WITH);
    await writeFiles(root, { "src/app.ts": "1\n" });
    const env = { PROCESOS_A: "1", PROCESOS_B: String(CORES + 1) };
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"], { env })).code).toBe(0);
    expect(await read(root, ".git/procesos-tarea")).toBe(`1 ${TASK}`);
  });

  it("AC3: without variables in verify.processes.env, the commands get Specty's environment as it is", async () => {
    const env = { PROCESOS_A: String(CORES + 1) };
    const root = await approved(BASE);
    await writeFiles(root, { "src/app.ts": "1\n" });
    expect((await cli(root, ["task", "done", "T1", "--summary", "Uno"], { env })).code).toBe(0);
    expect(await read(root, ".git/procesos-tarea")).toBe(`${CORES + 1} undefined`);
    const empty = await tempRepo({
      ...APP,
      ".specty/config.yaml": `${BASE}  processes:\n    env: []\n`,
    });
    expect((await cli(empty, ["verify", "--fresh"], { env })).code).toBe(0);
    expect(await read(empty, ".git/procesos-completa")).toBe(`${CORES + 1} undefined`);
  });

  it("AC1: specty verify --fresh gets 1 in each variable when not even one process of memoryMiB fits in the memory", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": processes(1_000_000_000) });
    expect((await cli(root, ["verify", "--fresh"])).code).toBe(0);
    expect(await read(root, ".git/procesos-completa")).toBe(both(1));
  });
});

/** `count` processes, in the singular for 1. */
const processesOf = (count: number) => `${count} ${count === 1 ? "proceso" : "procesos"}`;

/** The line of a command with `count` processes in both variables that holds `places` of 2. */
const lineOf = (count: number, places: number) =>
  new RegExp(
    `specty: ${processesOf(count)} en PROCESOS_A y PROCESOS_B \\(\\d+,\\d GB de memoria disponible, ${CORES} núcleos, ${places} de 2 plazas\\)`,
  );

describe("the line each verification command says as it starts", () => {
  it("AC1: task done says a task's number on the error output, and verify --fresh the full one's", async () => {
    const root = await approved(WITH);
    await writeFiles(root, { "src/app.ts": "1\n" });
    const done = await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    expect(done.code).toBe(0);
    expect(done.err).toMatch(lineOf(TASK, 1));
    const fresh = await cli(root, ["verify", "--fresh"]);
    expect(fresh.code).toBe(0);
    expect(fresh.err).toMatch(lineOf(CORES, 2));
  });

  it("AC1: verify --fresh says it in English when Specty speaks English", async () => {
    const config = WITH.replace("language: es", "language: en");
    const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
    const fresh = await cli(root, ["verify", "--fresh"]);
    expect(fresh.code).toBe(0);
    expect(fresh.err).toMatch(
      new RegExp(
        `specty: ${CORES} processes in PROCESOS_A and PROCESOS_B \\(\\d+\\.\\d GB of memory available, ${CORES} cores, 2 of 2 places\\)`,
      ),
    );
  });

  it("AC2: names apart a variable that keeps the smaller number of its environment", async () => {
    const root = await tempRepo({ ...APP, ".specty/config.yaml": WITH });
    const fresh = await cli(root, ["verify", "--fresh"], { env: { PROCESOS_A: "1" } });
    expect(fresh.code).toBe(0);
    expect(fresh.err).toContain(
      `specty: ${CORES} procesos en PROCESOS_B; se queda con el de su entorno: PROCESOS_A=1 (`,
    );
  });

  it("AC3: without variables in verify.processes.env, no verification command says the line", async () => {
    const root = await approved(BASE);
    await writeFiles(root, { "src/app.ts": "1\n" });
    const done = await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    expect(done.code).toBe(0);
    const fresh = await cli(root, ["verify", "--fresh"]);
    expect(fresh.code).toBe(0);
    for (const { err } of [done, fresh]) expect(err).not.toMatch(/specty: \d+ procesos? /);
  });
});
