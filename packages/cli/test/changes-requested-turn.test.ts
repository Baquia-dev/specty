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
  CONFIG,
  cli,
  DIST,
  NOW,
  person,
  SPEC,
  SPEC_PATH,
  tempRepo,
  testEnv,
  writeFiles,
} from "./support";

const CHECKS = "checks:\n  levels: { secrets: off }\n";
const WAIT_LINE = `${CHANGE} espera la decisión de la persona y ningún \`specty wait\` la espera`;

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

const comment = (root: string, body: string) =>
  act(root, (session, change) => addComment(session, change, { item: "A2" }, body));

/** Claude Code's hook before its `Bash` tool runs `command` in `root`. */
const bash = (root: string, command: string) =>
  cli(root, ["guard", "--tool", "claude-code"], {
    stdin: JSON.stringify({
      cwd: root,
      session_id: "s1",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command },
    }),
  });

/** Claude Code's end of the turn: what it sends the agent back with, or "" when the turn ends. */
async function endOfTurn(root: string): Promise<string> {
  const run = await cli(root, ["hook", "agent-stop", "claude-code"], {
    stdin: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
  });
  expect(run.code).toBe(0);
  return run.out === "" ? "" : String(JSON.parse(run.out).reason);
}

/** Who `status` says the change waits for, as data and in its line. */
async function expectStatus(root: string, waitingFor: "agent" | "human"): Promise<void> {
  const data = JSON.parse((await cli(root, ["--json", "status"])).out);
  expect(data.changes).toMatchObject([{ id: CHANGE, phase: "review", waitingFor }]);
  const who = waitingFor === "agent" ? "al agente" : "a ti";
  expect((await cli(root, ["status"])).out).toContain(
    `${CHANGE} · standard · review · espera ${who}`,
  );
}

/**
 * The turn is the agent's: `wait` hands back the card of `next` at once, `status` says so, the
 * guard lets `sleep` through and the end of the turn does not ask it to wait.
 */
async function expectAgentsTurn(root: string, card: string): Promise<void> {
  const waited = await cli(root, ["wait", "--interval", "100", "--timeout", "3"]);
  expect(waited.code).toBe(0);
  expect(waited.out).toContain(card);
  await expectStatus(root, "agent");
  expect((await bash(root, "sleep 1")).code).toBe(0);
  expect(await endOfTurn(root)).not.toContain(WAIT_LINE);
}

/** The turn is the person's: `status` says so, the guard stops `sleep` and the end of the turn asks to wait. */
async function expectPersonsTurn(root: string): Promise<void> {
  await expectStatus(root, "human");
  expect((await bash(root, "sleep 1")).code).toBe(2);
  expect(await endOfTurn(root)).toContain(WAIT_LINE);
}

describe("the turn once the person sends the review back", () => {
  it("AC1: after asking for changes, `wait`, `status`, the guard and the end of the turn give it to the agent", async () => {
    const root = await inReview();
    await expectPersonsTurn(root);
    await comment(root, "Mejor «amigo».");
    expect((await act(root, requestChanges)).status).toBe("ok");
    await expectAgentsTurn(root, "CAMBIOS PEDIDOS:\n  c1 · A2: Mejor «amigo».");
  });

  it("AC2: after rejecting an assumption when approving at the terminal, too", async () => {
    const root = await inReview();
    await cli(root, ["approve"], {
      terminal: person({ choose: ["reject"], ask: ["El nombre viene de la config"] }),
    });
    await expectAgentsTurn(
      root,
      "A1 «El nombre llega como argumento.» — El nombre viene de la config",
    );
  });

  it("AC3: a new proposal gives the turn back to the person", async () => {
    const root = await inReview();
    await comment(root, "Mejor «amigo».");
    await act(root, requestChanges);
    await writeFiles(root, { [SPEC_PATH]: SPEC.replace("se usa «mundo»", "se usa «amigo»") });
    expect((await cli(root, ["propose"])).code).toBe(0);
    await expectPersonsTurn(root);
    const waited = await cli(root, ["wait", "--interval", "100", "--timeout", "1"]);
    expect(waited.out).toContain("Tiempo de espera agotado (1s)");
  });

  it("AC4: a comment, or an assumption rejected alone from the UI, leaves the turn with the person", async () => {
    const root = await inReview();
    await comment(root, "Mejor «amigo».");
    await act(root, (session, change) =>
      decideAssumption(session, change, "A1", "rejected", "El nombre viene de la config"),
    );
    await expectPersonsTurn(root);
  });
});
