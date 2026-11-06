// SPDX-License-Identifier: Apache-2.0
import type { Output } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { resolveActive } from "../src/flow/active";
import { addComment, decideAssumption, requestChanges } from "../src/flow/review";
import { openSession, type Session } from "../src/session";
import type { StoredChange } from "../src/store/changes";
import {
  AGENT,
  APP,
  CHANGE,
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

const STATE = `.specty/changes/${CHANGE}/state.json`;

/** SPEC's change in review, revision 1. */
async function inReview(): Promise<string> {
  const root = await tempRepo(APP);
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

const comment = (root: string, body: string) =>
  act(root, (session, change) => addComment(session, change, { item: "A2" }, body));

/** When the person sent the review back, as `state.json` keeps it. */
async function requestedAt(root: string): Promise<unknown> {
  return JSON.parse(await read(root, STATE)).changesRequestedAt;
}

describe("the review the person sends back, in `state.json`", () => {
  it("AC1: asking for changes records when", async () => {
    const root = await inReview();
    expect(await requestedAt(root)).toBeUndefined();
    await comment(root, "Mejor «amigo».");
    expect((await act(root, requestChanges)).status).toBe("ok");
    expect(await requestedAt(root)).toBe(NOW.toISOString());
  });

  it("AC2: rejecting an assumption when approving at the terminal records it too", async () => {
    const root = await inReview();
    const rejected = await cli(root, ["approve"], {
      terminal: person({ choose: ["reject"], ask: ["El nombre viene de la config"] }),
    });
    expect(rejected.out).toContain("Rechazaste A1");
    expect(await requestedAt(root)).toBe(NOW.toISOString());
  });

  it("AC3: a new proposal takes it away, and so does the approval", async () => {
    const root = await inReview();
    await comment(root, "Mejor «amigo».");
    await act(root, requestChanges);
    await writeFiles(root, { [SPEC_PATH]: SPEC.replace("se usa «mundo»", "se usa «amigo»") });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect(await requestedAt(root)).toBeUndefined();

    await comment(root, "Más corto.");
    await act(root, requestChanges);
    expect(await requestedAt(root)).toBe(NOW.toISOString());
    const approved = await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    expect(approved.out).toContain("Revisión 2 aprobada");
    expect(await requestedAt(root)).toBeUndefined();
  });

  it("AC4: a comment, or an assumption rejected alone from the UI, does not record it", async () => {
    const root = await inReview();
    await comment(root, "Mejor «amigo».");
    const decided = await act(root, (session, change) =>
      decideAssumption(session, change, "A1", "rejected", "El nombre viene de la config"),
    );
    expect(decided.status).toBe("ok");
    expect(await requestedAt(root)).toBeUndefined();
  });
});
