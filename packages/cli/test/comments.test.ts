// SPDX-License-Identifier: Apache-2.0
import type { Output } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { resolveActive } from "../src/flow/active";
import { addComment, requestChanges } from "../src/flow/review";
import { openSession, type Session } from "../src/session";
import type { StoredChange } from "../src/store/changes";
import {
  AGENT,
  APP,
  CHANGE,
  cli,
  DIST,
  NOW,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

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

const COMMENTS = `.specty/changes/${CHANGE}/comments.json`;
const comment = (root: string, anchor: Parameters<typeof addComment>[2], body: string) =>
  act(root, (session, change) => addComment(session, change, anchor, body));

describe("comments in the review", () => {
  it("keep each comment with its anchor, author and revision (AC1)", async () => {
    const root = await inReview();
    const added = await comment(root, { section: "design", quote: "saludo" }, " Más corto. ");
    expect(added.status).toBe("ok");
    await comment(root, { item: "A2" }, "Mejor «amigo».");
    expect(JSON.parse(await read(root, COMMENTS))).toMatchObject([
      {
        id: "c1",
        revision: 1,
        anchor: { section: "design", quote: "saludo" },
        author: "Ana",
        body: "Más corto.",
        createdAt: NOW.toISOString(),
      },
      { id: "c2", anchor: { item: "A2" }, body: "Mejor «amigo»." },
    ]);
    expect((await comment(root, { item: "A1" }, "  ")).status).toBe("blocked");
  });

  it("reach the agent once the person asks for the changes (AC2)", async () => {
    const root = await inReview();
    expect((await act(root, requestChanges)).status).toBe("blocked");
    await comment(root, { item: "A2" }, "Mejor «amigo».");
    // Until the person asks, the review is still theirs.
    expect((await cli(root, ["next"])).out).not.toContain("CAMBIOS PEDIDOS");
    expect((await act(root, requestChanges)).status).toBe("ok");
    const audit = (await read(root, `.specty/changes/${CHANGE}/audit.jsonl`))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(audit.at(-1)).toMatchObject({
      actor: "human",
      event: "review.changes_requested",
      data: { revision: 1, comments: ["c1"] },
    });
    const next = (await cli(root, ["next"])).out;
    expect(next).toContain("CAMBIOS PEDIDOS:\n  c1 · A2: Mejor «amigo».");
    expect(next).toContain(`SIGUIENTE: corrige ${SPEC_PATH} y ejecuta \`specty propose\`.`);
  });

  it("are resolved by the next revision the agent proposes (AC3)", async () => {
    const root = await inReview();
    await comment(root, { item: "A2" }, "Mejor «amigo».");
    await act(root, requestChanges);
    await writeFiles(root, { [SPEC_PATH]: SPEC.replace("se usa «mundo»", "se usa «amigo»") });
    expect((await cli(root, ["propose"])).code).toBe(0);
    expect(JSON.parse(await read(root, COMMENTS))[0]).toMatchObject({ resolvedInRevision: 2 });
    expect((await cli(root, ["next"])).out).not.toContain("CAMBIOS PEDIDOS");
  });
});
