// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { taskRuns } from "../../src/server/watched-runs";
import { writeRun } from "../../src/store/runs";
import { AGENT, APP, CHANGE, CONFIG, NOW, SPEC, SPEC_PATH, tempRepo, writeFiles } from "../support";
import { call, listen, serving, sessionAt } from "./support";

/** `config.yaml` with `internal.server` set to `server`. */
const WITH = (server: string) => `${CONFIG()}internal:\n  server:\n    ${server}\n`;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Waits, in real time, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!done()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await wait(20);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

/**
 * With `config`, how many `changes` the server's events say before and after `every` ms go by,
 * a change having moved after the first: the server looks again only when the test says.
 */
async function changesHeard(config: string, every: number) {
  const { root, server, headers } = await serving(true, config);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const events = listen(server.port, headers);
  const changes = () => events.heard.filter((event) => event.name === "changes").length;
  try {
    await events.until((event) => event.name === "changes");
    await writeFiles(root, { [SPEC_PATH]: `${SPEC}\n` });
    await vi.advanceTimersByTimeAsync(every - 1);
    await wait(500);
    const before = changes();
    await vi.advanceTimersByTimeAsync(1);
    await until(() => changes() > before);
    return [before, changes()];
  } finally {
    events.close();
    vi.useRealTimers();
    await server.close();
  }
}

/**
 * With `config`, whether the server heard a task's verification that another process keeps live
 * before and after `every` ms go by: it looks again only when the test says.
 */
async function taskHeard(config: string, every: number) {
  const session = await sessionAt(await tempRepo({ ...APP, ".specty/config.yaml": config }), AGENT);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const heard: string[] = [];
  const runs = taskRuns(session, (id, run) => heard.push(`${id} ${run?.task}`));
  try {
    const run = { task: "T1", command: "true", output: [], pid: process.pid };
    await writeRun(session.git, CHANGE, { ...run, startedAt: NOW.toISOString() });
    await vi.advanceTimersByTimeAsync(every - 1);
    await wait(300);
    const before = [...heard];
    await vi.advanceTimersByTimeAsync(1);
    await until(() => heard.length > 0);
    return [before, heard];
  } finally {
    runs.close();
  }
}

/** With `config`, the status of a delegation with a body of `kib` KiB, and whether it is on. */
async function delegated(config: string, kib: number) {
  const { server, headers } = await serving(true, config);
  try {
    const body = { on: true, pad: "x".repeat(kib * 1024) };
    const status = (await call(server.port, "/api/delegation", headers, body)).status;
    const view = JSON.parse((await call(server.port, "/api/delegation", headers)).body);
    return [status, view.on];
  } finally {
    await server.close();
  }
}

describe("the limits of the UI's server", () => {
  it("AC1: looks at whether the changes moved every internal.server.changesEveryMs while someone listens", async () => {
    expect(await changesHeard(WITH("changesEveryMs: 60000"), 60000)).toEqual([1, 2]);
  });

  it("AC1: looks every second without the key", async () => {
    expect(await changesHeard(CONFIG(), 1000)).toEqual([1, 2]);
  });

  it("AC2: reads the verifications other processes keep live every internal.server.tasksEveryMs", async () => {
    expect(await taskHeard(WITH("tasksEveryMs: 60000"), 60000)).toEqual([[], [`${CHANGE} T1`]]);
  });

  it("AC2: reads them every half second without the key", async () => {
    expect(await taskHeard(CONFIG(), 500)).toEqual([[], [`${CHANGE} T1`]]);
  });

  it("AC5: reads an action's body up to internal.server.maxBodyKiB, and one past it as none", async () => {
    expect(await delegated(WITH("maxBodyKiB: 128"), 100)).toEqual([200, true]);
    expect(await delegated(WITH("maxBodyKiB: 128"), 130)).toEqual([400, false]);
  });

  it("AC5: reads it up to 64 KiB without the key", async () => {
    expect(await delegated(CONFIG(), 60)).toEqual([200, true]);
    expect(await delegated(CONFIG(), 100)).toEqual([400, false]);
  });
});
