// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { APP, cli, tempRepo } from "./support";

/** An agent that Specty recognizes: Claude Code. */
const CLAUDE = { env: { CLAUDECODE: "1" } };

/** The end of `tool`'s turn, with `message` as its last one. */
const stop = (root: string, tool: string, message: string, active = false) =>
  cli(root, ["hook", "memory-stop", tool], {
    stdin: JSON.stringify({
      hook_event_name: "Stop",
      session_id: "s1",
      stop_hook_active: active,
      last_assistant_message: message,
    }),
  });

/** A repository whose memory has the pending item «Uno» as P1. */
async function withOne(): Promise<string> {
  const root = await tempRepo(APP);
  expect((await cli(root, ["memory", "add", "Uno"], CLAUDE)).code).toBe(0);
  return root;
}

const ENDING = "Hecho.\n\n**Qué queda pendiente**\n- P1: sigue abierto.\n- Revisar el README.\n";

describe("specty hook memory-stop", () => {
  it("AC1: sends Claude Code's and Codex's turn back with the items not in the memory", async () => {
    const root = await withOne();
    for (const tool of ["claude-code", "codex"]) {
      const run = await stop(root, tool, ENDING);
      expect(run.code, tool).toBe(0);
      const reply = JSON.parse(run.out);
      expect(reply.decision, tool).toBe("block");
      expect(reply.reason, tool).toContain(
        "Tu último mensaje deja pendientes que no están en la memoria de Specty:\n- Revisar el README.\n",
      );
      expect(reply.reason, tool).not.toContain("P1: sigue abierto.");
      expect(reply.reason, tool).toContain('`specty memory add "<texto>"`');
    }
  });

  it("AC2: lets the turn end once it was sent back", async () => {
    const root = await withOne();
    const run = await stop(root, "claude-code", ENDING, true);
    expect(run.code).toBe(0);
    expect(run.out).toBe("");
  });

  it("AC3: lets the turn end without pending items, or with all of them in the memory", async () => {
    const root = await withOne();
    for (const message of [
      "Hecho. Todo verificado.",
      "**Qué cambió**\n- Uno nuevo\n",
      "**Pendientes**\n- P1: sigue abierto.\n- Uno\n- Ninguno.\n",
    ]) {
      const run = await stop(root, "claude-code", message);
      expect(run.code, message).toBe(0);
      expect(run.out, message).toBe("");
    }
  });

  it("AC3: says nothing for an agent whose end of turn has no last message", async () => {
    const root = await withOne();
    const run = await stop(root, "cursor", ENDING);
    expect(run.code).toBe(0);
    expect(run.out).toBe("");
  });
});
