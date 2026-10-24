// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CHANGE, CONFIG, read } from "../support";
import { call, implemented, listen, path, serving } from "./support";

const SLOW = "echo uno && sleep 1 && echo dos";
const withFull = (full: string) => `${CONFIG()}  full: ${JSON.stringify(full)}\n`;

/** The change's audit lines, oldest first. */
async function audit(root: string): Promise<Readonly<Record<string, unknown>>[]> {
  const text = await read(root, `.specty/changes/${CHANGE}/audit.jsonl`);
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

/**
 * Waits for the full verification of `command` to end: its first event, then a `run: null` after
 * it. The tasks' own runs (`task done`) also end with `run: null`, but only before it starts.
 */
async function fullEnds(events: ReturnType<typeof listen>, command: string) {
  const mark = `"command":${JSON.stringify(command)}`;
  await events.until(({ data }) => data.includes(mark));
  const from = events.heard.findIndex(({ data }) => data.includes(mark));
  const ended = () =>
    events.heard
      .slice(from)
      .some(({ name, data }) => name === "run" && data.endsWith('"run":null}'));
  await events.until(ended);
}

describe("the full verification from the local server", () => {
  it("runs in the change's folder, live, and its result goes to the audit (AC1, AC2, AC4)", async () => {
    const { root, server, headers } = await serving(true, withFull(SLOW));
    const events = listen(server.port, headers);
    try {
      await implemented(root, "1\n", "2\n");
      await events.until(({ name }) => name === "changes");
      const started = await call(server.port, path("verify"), headers, {});
      expect(started.status).toBe(200);
      expect(started.body).toContain(`Verificación completa en marcha: \`${SLOW}\`.`);
      // A tab that opens now sees it from what it has so far.
      const going = JSON.parse((await call(server.port, path("run"), headers)).body);
      expect(going).toMatchObject({ command: SLOW, startedAt: expect.any(String) });
      const again = await call(server.port, path("verify"), headers, {});
      expect([again.status, again.body.includes("Ya corre la verificación completa")]).toEqual([
        409,
        true,
      ]);
      await fullEnds(events, SLOW);
      const runs = events.heard.filter(({ name }) => name === "run").map(({ data }) => data);
      expect(runs.some((data) => data.includes('"output":["uno"]'))).toBe(true);
      expect(runs.every((data) => data.includes(`"change":"${CHANGE}"`))).toBe(true);
      expect((await audit(root)).at(-1)).toMatchObject({
        actor: "specty",
        event: "change.verified",
        data: { cmd: SLOW, exit: 0, ms: expect.any(Number) },
      });
      expect((await call(server.port, path("run"), headers)).body).toBe("null");
    } finally {
      events.close();
      await server.close();
    }
  });

  it("keeps the end of a failed run, and refuses what cannot run (AC2, AC3)", async () => {
    const { root, server, headers } = await serving(true, withFull("echo mal && exit 3"));
    const events = listen(server.port, headers);
    try {
      const early = await call(server.port, path("verify"), headers, {});
      expect([early.status, early.body]).toEqual([409, expect.stringContaining("en aceptación")]);
      const missing = await call(server.port, "/api/changes/20990101-nada/verify", headers, {});
      expect(missing.body).toContain("No hay ningún cambio 20990101-nada.");
      await implemented(root, "1\n", "2\n");
      expect((await call(server.port, path("verify"), headers, {})).status).toBe(200);
      await fullEnds(events, "echo mal && exit 3");
      expect((await audit(root)).at(-1)).toMatchObject({
        event: "change.verified",
        data: { exit: 3, outputTail: ["mal"] },
      });
    } finally {
      events.close();
      await server.close();
    }
  });

  it("needs `verify.full` and the person's server", async () => {
    const plain = await serving();
    try {
      await implemented(plain.root, "1\n", "2\n");
      const none = await call(plain.server.port, path("verify"), plain.headers, {});
      expect([none.status, none.body]).toEqual([
        409,
        expect.stringContaining("no tiene verificación completa"),
      ]);
    } finally {
      await plain.server.close();
    }
    const readOnly = await serving(false, withFull(SLOW));
    const refused = await call(readOnly.server.port, path("verify"), readOnly.headers, {});
    expect(refused.status).toBe(403);
    await readOnly.server.close();
  });

  it("ends a run still going when the server closes, without recording it", async () => {
    const { root, server, headers } = await serving(true, withFull("sleep 5"));
    await implemented(root, "1\n", "2\n");
    expect((await call(server.port, path("verify"), headers, {})).status).toBe(200);
    await server.close();
    await new Promise((done) => setTimeout(done, 300));
    expect((await audit(root)).some(({ event }) => event === "change.verified")).toBe(false);
  });
});
