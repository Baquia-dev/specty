// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { ui } from "../../src/commands/ui";
import { fingerprint } from "../../src/server/events";
import {
  AGENT,
  APP,
  ARCHIVE,
  CHANGE,
  CONFIG,
  cli,
  git,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "../support";
import { call, path, serving, sessionAt, state } from "./support";

describe("the person's actions in the local server", () => {
  it("are there only when the person started the server (AC1)", async () => {
    const { server, session, headers } = await serving();
    expect(session).toEqual({ actions: true, csrf: expect.any(String) });
    await server.close();
    const readOnly = await serving(false);
    expect(readOnly.session).toEqual({ actions: false });
    const refused = await call(readOnly.server.port, path("approve"), readOnly.headers, {
      revision: 1,
    });
    expect([refused.status, refused.body]).toEqual([403, '{"error":"read-only"}']);
    await readOnly.server.close();
    expect(headers.cookie).toMatch(/^specty-\d+=/);
  });

  it("approve the revision the person saw, once its assumptions are confirmed (AC2, AC3)", async () => {
    const { root, server, headers } = await serving();
    try {
      const early = await call(server.port, path("approve"), headers, { revision: 1 });
      expect(early.status).toBe(409);
      expect(early.body).toContain("Faltan por confirmar supuestos de alto impacto: A1.");
      const decided = await call(server.port, path("assumptions/A1"), headers, {
        decision: "confirmed",
      });
      expect(decided.status).toBe(200);
      const stale = await call(server.port, path("approve"), headers, { revision: 2 });
      expect([stale.status, stale.body.includes("La revisión vigente es la 1, no la 2.")]).toEqual([
        409,
        true,
      ]);
      expect((await call(server.port, path("approve"), headers, { revision: 1 })).status).toBe(200);
      expect(await state(root)).toMatchObject({
        phase: "implementing",
        approved: { channel: "ui" },
      });
      expect(git(root, "log", "-1", "--format=%s")).toBe("docs(spec): Saludo personalizado");
    } finally {
      await server.close();
    }
  });

  it("AC4: approve the tests the agent sent, as specty approve from the UI", async () => {
    // With contract, a verification that fails naming the test, and a test in the task.
    const red = `node -e "console.log('FAIL src/app.test.ts'); process.exit(1)"`;
    const contract = `${CONFIG(red)}policy:\n  tests: contract\n`;
    const feature = SPEC.replace(
      "  - files: src/app.ts\n",
      "  - files: src/app.ts, src/app.test.ts\n",
    );
    const { root, server, headers } = await serving(true, contract, feature);
    try {
      await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
      await writeFiles(root, { "src/app.test.ts": "it('AC1: saluda a Ana', () => {});\n" });
      const sent = await cli(root, ["propose"]);
      expect([sent.code, (await state(root)).phase], sent.out).toEqual([0, "testing"]);
      const approved = await call(server.port, path("approve"), headers, { revision: 1 });
      expect(approved.status, approved.body).toBe(200);
      expect(await state(root)).toMatchObject({
        phase: "implementing",
        lockedTests: { "src/app.test.ts": expect.stringMatching(/^sha256:/) },
      });
      const audit = (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`)).trim().split("\n");
      expect(JSON.parse(audit.at(-1) ?? "{}")).toMatchObject({
        event: "tests.approved",
        data: { channel: "ui" },
      });
    } finally {
      await server.close();
    }
  });

  it("decide scope, accept and close like the terminal, in the change's folder (AC4)", async () => {
    const { root, server, headers } = await serving();
    try {
      await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
      await cli(root, ["next"]);
      await cli(root, ["scope", "add", "lib/other.ts", "--reason", "Ayudante"]);
      const scope = await call(server.port, path("scope/S1"), headers, { decision: "approved" });
      expect(scope.status).toBe(200);
      expect((await state(root)).tasks.T1.scopeExtra).toEqual(["lib/other.ts"]);
      for (const [task, text] of [
        ["T1", "1\n"],
        ["T2", "2\n"],
      ] as const) {
        await writeFiles(root, { "src/app.ts": text });
        await cli(root, ["task", "done", task, "--summary", task]);
      }
      expect((await call(server.port, path("accept"), headers, {})).status).toBe(200);
      expect((await state(root)).phase).toBe("closing");
      const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
      await writeFiles(root, { [SPEC_PATH]: `${await read(root, SPEC_PATH)}${closing}` });
      await cli(root, ["propose"]);
      expect((await call(server.port, path("close"), headers, {})).status).toBe(200);
      expect(await read(root, `${ARCHIVE}/${CHANGE}/state.json`)).toContain('"phase": "done"');
    } finally {
      await server.close();
    }
  });

  it("ask the agent for an adjustment with the person's words (AC4)", async () => {
    const { root, server, headers } = await serving();
    try {
      await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
      await cli(root, ["next"]);
      for (const task of ["T1", "T2"]) {
        await writeFiles(root, { "src/app.ts": `${task}\n` });
        await cli(root, ["task", "done", task, "--summary", task]);
      }
      const request = "El saludo va en mayúsculas.";
      expect((await call(server.port, path("adjust"), headers, { request })).status).toBe(200);
      expect(await state(root)).toMatchObject({
        phase: "adjusting",
        pending: { adjustment: { request } },
      });
    } finally {
      await server.close();
    }
  });

  it("refuse anything without the session, the origin or the CSRF token (AC5)", async () => {
    const { root, server, headers } = await serving();
    try {
      const { cookie, origin } = headers;
      const csrf = headers["x-specty-csrf"];
      const confirm = { decision: "confirmed" };
      for (const sent of [
        { cookie, origin },
        { cookie, origin, "x-specty-csrf": "wrong" },
        { cookie, "x-specty-csrf": csrf },
        { cookie, origin: "http://evil.example", "x-specty-csrf": csrf },
        { origin, "x-specty-csrf": csrf },
      ]) {
        expect((await call(server.port, path("assumptions/A1"), sent, confirm)).status).toBe(403);
      }
      expect((await call(server.port, path("approve"), headers, {})).status).toBe(400);
      expect((await call(server.port, path("dance"), headers, {})).status).toBe(400);
      expect((await state(root)).items.A1.decision).toBe("pending");
    } finally {
      await server.close();
    }
  });
});

describe("specty ui and the person's actions", () => {
  it("says whether the UI can decide, by who started it (AC1)", async () => {
    const root = await tempRepo(APP);
    for (const [terminal, says] of [
      [person(), "Desde la UI puedes aprobar, decidir el alcance, aceptar y cerrar."],
      [AGENT, "Solo lectura: lo arrancó el agente."],
    ] as const) {
      const printed: string[] = [];
      const session = await sessionAt(root, terminal, (text) => {
        printed.push(text);
      });
      await ui(session, "0", Promise.resolve());
      expect(printed.join("\n")).toContain(says);
    }
  });
});

describe("delegated mode in the local server", () => {
  it("is read with its warning, and switched only by the person (AC1, AC2)", async () => {
    const { root, server, headers } = await serving();
    const delegation = "/api/delegation";
    try {
      const view = async () => JSON.parse((await call(server.port, delegation, headers)).body);
      expect(await view()).toMatchObject({
        on: false,
        warning: {
          es: expect.arrayContaining([expect.stringContaining("Con el modo delegado")]),
          en: expect.arrayContaining([expect.stringContaining("In delegated mode")]),
        },
      });
      expect((await call(server.port, delegation, headers, { on: true })).status).toBe(200);
      expect(await view()).toMatchObject({ on: true, by: "Ana", at: expect.any(String) });
      expect((await cli(root, ["status"], { terminal: person() })).out).toContain("MODO DELEGADO");
      expect((await call(server.port, delegation, headers, { on: "sí" })).status).toBe(400);
      const { cookie, origin } = headers;
      expect((await call(server.port, delegation, { cookie, origin }, { on: false })).status).toBe(
        403,
      );
      expect((await call(server.port, delegation, headers, { on: false })).status).toBe(200);
      expect((await view()).on).toBe(false);
    } finally {
      await server.close();
    }
    const readOnly = await serving(false);
    const refused = await call(readOnly.server.port, delegation, readOnly.headers, { on: true });
    expect(refused.status).toBe(403);
    await readOnly.server.close();
  });

  it("moves the fingerprint of the events when it changes (AC3)", async () => {
    const { root, server } = await serving();
    await server.close();
    const session = await sessionAt(root, AGENT);
    const before = await fingerprint(session);
    await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
    expect(await fingerprint(session)).not.toBe(before);
  });
});
