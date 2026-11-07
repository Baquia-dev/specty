// SPDX-License-Identifier: Apache-2.0
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { hashText } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import {
  APP,
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
} from "./support";

const STATE = `.specty/changes/${CHANGE}/state.json`;

/** A repository whose change waits for the person to approve its spec. */
async function proposed(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": CONFIG() });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  await cli(root, ["propose"]);
  return root;
}

/** `proposed`'s change, approved by the person, with T1 active. */
async function implementing(): Promise<string> {
  const root = await proposed();
  await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
  await cli(root, ["next"]);
  return root;
}

/** The person turns delegated mode on in their terminal. */
async function delegate(root: string): Promise<void> {
  const on = await cli(root, ["delegate", "on"], { terminal: person({ choose: ["yes"] }) });
  expect(on.code, on.out).toBe(0);
}

const stateOf = async (root: string) => JSON.parse(await read(root, STATE));

/**
 * T1 waits for the person to decide S1, which unlocks `src/app.test.ts`, a test they approved
 * (ADR 0014): what `scope add` leaves on a locked test, written in the change's state.
 */
async function unlockPending(root: string): Promise<void> {
  const state = await stateOf(root);
  const request = { id: "S1", task: "T1", paths: ["src/app.test.ts"], reason: "Dice «Hola Ana»" };
  const locked = {
    ...state,
    lockedTests: { "src/app.test.ts": hashText("it('AC1: saluda a Ana', () => {});\n") },
    pending: { ...state.pending, scopeRequests: [request] },
  };
  await writeFiles(root, { [STATE]: `${JSON.stringify(locked, null, 2)}\n` });
}

/** Where the mark of the `wait` of `root`'s change lives, shared by every worktree. */
const markPath = (root: string) =>
  join(root, git(root, "rev-parse", "--git-path", `common/specty/waits/${CHANGE}.json`));

const hasMark = (root: string) =>
  access(markPath(root)).then(
    () => true,
    () => false,
  );

const markOf = async (root: string) => JSON.parse(await readFile(markPath(root), "utf8"));

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until the mark of `root`'s change exists, for 5 s at most. */
async function marked(root: string): Promise<void> {
  for (let look = 0; look < 100 && !(await hasMark(root)); look += 1) await pause(50);
  expect(await hasMark(root)).toBe(true);
}

const APPROVE_SPEC =
  "SIGUIENTE: modo delegado: aprueba tú la spec con `specty approve` y sigue su salida.";

describe("`specty wait` in delegated mode", () => {
  it("AC1: in review, returns at once with the card that asks the agent to approve the spec, and leaves no mark", async () => {
    const root = await proposed();
    await delegate(root);
    const result = await cli(root, ["wait", "--interval", "50", "--timeout", "2"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(APPROVE_SPEC);
    expect(result.out).not.toContain("Tiempo de espera agotado");
    expect(await hasMark(root)).toBe(false);
    expect((await stateOf(root)).phase).toBe("review");
  });

  it("AC1: with a scope request the agent decides, returns at once with the request's card in delegated mode", async () => {
    const root = await implementing();
    await delegate(root);
    const asked = await cli(root, ["scope", "add", "src/extra.ts", "--reason", "Ayudante"]);
    expect(asked.code, asked.out).toBe(0);
    const result = await cli(root, ["wait", "--interval", "50", "--timeout", "2"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("SOLICITUD S1:\n  src/extra.ts");
    expect(result.out).toContain(
      "SIGUIENTE: modo delegado: aprueba tú la solicitud con `specty approve --scope S1` y sigue con la tarea.",
    );
    expect(await hasMark(root)).toBe(false);
    expect((await stateOf(root)).pending.scopeRequests).toHaveLength(1);
  });

  it("AC2, AC4: waits while the only pending request unlocks an approved test, and times out with the delegated card", async () => {
    const root = await implementing();
    await unlockPending(root);
    await delegate(root);
    const result = await cli(root, ["wait", "--interval", "50", "--timeout", "1"]);
    expect(result.out).toContain(`Tiempo de espera agotado (1s) en ${CHANGE}`);
    expect(result.out).toContain(
      "SIGUIENTE: la decisión pendiente es solo de la persona, también en modo delegado: recuérdasela y vuelve a ejecutar ya `specty wait` para esperar su decisión.",
    );
    expect((await markOf(root)).ended.reason).toBe("timeout");
  });

  it("AC3: when the person turns delegated mode on while it waits, ends its mark as decided and returns next's delegated card", async () => {
    const root = await proposed();
    const waiting = cli(root, ["wait", "--interval", "50", "--timeout", "5"]);
    await marked(root);
    await delegate(root);
    const result = await waiting;
    expect(result.code).toBe(0);
    expect(result.out).toContain(APPROVE_SPEC);
    expect(result.out).not.toContain("Tiempo de espera agotado");
    expect((await markOf(root)).ended.reason).toBe("decided");
    expect((await stateOf(root)).phase).toBe("review");
  });
});
