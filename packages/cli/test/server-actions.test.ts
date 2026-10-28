// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { accept } from "../src/commands/accept";
import { approve } from "../src/commands/approve";
import { resolveActive } from "../src/flow/active";
import { decideAssumption } from "../src/flow/review";
import { openSession, type Session, type Terminal } from "../src/session";
import {
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

/** The person deciding on the UI's screen: what they chose there is already decided. */
function screen(): Terminal & { readonly notes: string[] } {
  const notes: string[] = [];
  return {
    interactive: true,
    channel: "ui",
    confirm: () => Promise.resolve(true),
    choose: () => Promise.resolve(undefined),
    chooseMany: () => Promise.resolve(undefined),
    ask: () => Promise.resolve(undefined),
    note: (title) => {
      notes.push(title);
    },
    notes,
  };
}

/** A session in `cwd` with `terminal`, as the server opens one for each action. */
async function sessionAt(cwd: string, terminal: Terminal): Promise<Session> {
  const opened = await openSession({
    cwd,
    env: testEnv(),
    now: () => NOW,
    terminal,
    io: { out: () => undefined, err: () => undefined },
    invocation: { command: `node "${DIST}"`, portable: false, script: DIST },
  });
  if (opened.kind !== "ok") throw new Error(`no Specty session in ${cwd}`);
  return opened.session;
}

/** SPEC's change in review: A1 has a high impact. */
async function inReview(config = CONFIG()): Promise<string> {
  const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
  await cli(root, ["new", "Saludo personalizado"]);
  await writeFiles(root, { [SPEC_PATH]: SPEC });
  expect((await cli(root, ["propose"])).code).toBe(0);
  return root;
}

const STATE = `.specty/changes/${CHANGE}/state.json`;
const AUDIT = `.specty/changes/${CHANGE}/audit.jsonl`;
const lastAudit = async (root: string) =>
  JSON.parse((await read(root, AUDIT)).trim().split("\n").at(-1) ?? "{}");

async function decide(
  root: string,
  item: string,
  decision: "confirmed" | "rejected",
  why?: string,
) {
  const session = await sessionAt(root, screen());
  const change = await resolveActive(session);
  if (change === undefined) throw new Error("no change");
  return decideAssumption(session, change, item, decision, why);
}

describe("deciding from the UI", () => {
  it("records one assumption's decision, with the reason of a rejection (AC3)", async () => {
    const root = await inReview();
    expect((await decide(root, "A1", "rejected", " Por trimestres. ")).status).toBe("ok");
    expect(JSON.parse(await read(root, STATE)).items.A1).toMatchObject({
      decision: "rejected",
      comment: "Por trimestres.",
    });
    expect(await lastAudit(root)).toMatchObject({
      actor: "human",
      event: "assumption.decided",
      data: { item: "A1", decision: "rejected", comment: "Por trimestres." },
    });
    expect((await decide(root, "A1", "confirmed", "sobra")).status).toBe("ok");
    const confirmed = JSON.parse(await read(root, STATE)).items.A1;
    expect(confirmed.decision).toBe("confirmed");
    expect(confirmed.comment).toBeUndefined();
    for (const item of ["A9", "AC1"]) {
      const refused = await decide(root, item, "confirmed");
      expect(refused.status).toBe("blocked");
      expect(refused.blocks.flatMap((block) => block.lines).join("\n")).toContain(
        `La spec no tiene el supuesto ${item}.`,
      );
    }
  });

  it("approves with the UI as the channel, once the assumptions are decided (AC2)", async () => {
    const root = await inReview();
    await decide(root, "A1", "confirmed");
    const approved = await approve(await sessionAt(root, screen()), undefined);
    expect(approved.status).toBe("ok");
    const state = JSON.parse(await read(root, STATE));
    expect(state.phase).toBe("implementing");
    expect(state.approved).toMatchObject({ revision: 1, by: "Ana", channel: "ui" });
    // Outside the review there is nothing to decide.
    expect((await decide(root, "A1", "rejected")).status).toBe("blocked");
    expect(JSON.parse(await read(root, STATE)).items.A1.decision).toBe("confirmed");
  });

  it("accepts without asking about the full verification when the UI already said (AC4)", async () => {
    const root = await inReview(`${CONFIG()}  full: "false"\n`);
    await cli(root, ["approve"], { terminal: person({ choose: ["confirm"] }) });
    await cli(root, ["next"]);
    await writeFiles(root, { "src/app.ts": "1\n" });
    await cli(root, ["task", "done", "T1", "--summary", "Uno"]);
    await writeFiles(root, { "src/app.ts": "2\n" });
    await cli(root, ["task", "done", "T2", "--summary", "Dos"]);
    const terminal = screen();
    const accepted = await accept(await sessionAt(root, terminal), false);
    expect(accepted.status).toBe("ok");
    expect(JSON.parse(await read(root, STATE)).phase).toBe("closing");
    expect(terminal.notes.some((title) => title.startsWith("Verificación"))).toBe(false);
  });
});
