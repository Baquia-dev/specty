// SPDX-License-Identifier: Apache-2.0
import type { Output } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { resolveActive } from "../src/flow/active";
import { decideAssumption, requestChanges } from "../src/flow/review";
import { openSession, type Session } from "../src/session";
import type { StoredChange } from "../src/store/changes";
import {
  AGENT,
  APP,
  CHANGE,
  CONFIG,
  cli,
  DIST,
  NOW,
  person,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

const CHECKS = "checks:\n  levels: { secrets: off }\n";
const WAITING = "Esperando la revisión del usuario. No modifiques código.";
const REASON = "El nombre viene de la config";
const REJECTED = `SUPUESTOS RECHAZADOS:\n  A1 «El nombre llega como argumento.» — ${REASON}`;

/** SPEC's change in review, revision 1. */
async function inReview(): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": `${CONFIG()}${CHECKS}` });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  return root;
}

/** Runs one of the person's review actions on the change of `root`, as the server does. */
async function act(root: string, run: (session: Session, change: StoredChange) => Promise<Output>) {
  const opened = await openSession({
    cwd: root,
    env: testEnv(),
    now: () => NOW,
    terminal: AGENT,
    io: { out: () => undefined, err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error("no Specty session");
  const change = await resolveActive(opened.session);
  if (change === undefined) throw new Error("no change");
  return run(opened.session, change);
}

const next = async (root: string): Promise<string> => (await cli(root, ["next"])).out;

describe("the card of `next` once the person sends the review back", () => {
  it("AC1: an assumption rejected alone from the UI waits for the person until they ask for the changes", async () => {
    const root = await inReview();
    await act(root, (session, change) =>
      decideAssumption(session, change, "A1", "rejected", REASON),
    );
    const before = await next(root);
    expect(before).toContain(WAITING);
    expect(before).not.toContain("SUPUESTOS RECHAZADOS");
    expect((await act(root, requestChanges)).status).toBe("ok");
    const after = await next(root);
    expect(after).toContain(REJECTED);
    expect(after).toContain(`SIGUIENTE: corrige ${SPEC_PATH} y ejecuta \`specty propose\`.`);
  });

  it("AC2: an assumption rejected when approving at the terminal reaches the agent, until its next proposal", async () => {
    const root = await inReview();
    await cli(root, ["approve"], { terminal: person({ choose: ["reject"], ask: [REASON] }) });
    const audit = await read(root, `.specty/changes/${CHANGE}/audit.jsonl`);
    expect(audit).not.toContain("review.changes_requested");
    expect(await next(root)).toContain(REJECTED);
    await writeFiles(root, {
      [SPEC_PATH]: SPEC.replace("El nombre llega como argumento.", `${REASON}.`),
    });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect(await next(root)).toContain(WAITING);
  });
});
