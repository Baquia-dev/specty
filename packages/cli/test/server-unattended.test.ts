// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { call, implemented, path, serving } from "./server/support";
import { CHANGE, cli, NOW, person, read, SPEC_PATH, writeFiles } from "./support";

const MINUTE = 60_000;
/** `minutes` from NOW, the session's clock: negative, before it. */
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE).toISOString();

const AUDIT = `.specty/changes/${CHANGE}/audit.jsonl`;
const MARK = `.git/common/specty/waits/${CHANGE}.json`;

/** The id of a process that already ended. */
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;

type Served = Awaited<ReturnType<typeof serving>>;

/** A decision of the person from the UI, as its server takes it. */
async function decide({ server, headers }: Served, action: string, body: unknown = {}) {
  const answer = await call(server.port, path(action), headers, body);
  expect(answer.status, `${action}: ${answer.body}`).toBe(200);
}

/** The person approves the spec from the UI: its high-impact assumption, then its revision. */
async function approveFromUi(served: Served): Promise<void> {
  await decide(served, "assumptions/A1", { decision: "confirmed" });
  await decide(served, "approve", { revision: 1 });
}

/** The person rejects SPEC's assumption when approving at the terminal: the review goes back. */
async function rejectAtTerminal(root: string): Promise<void> {
  const approved = await cli(root, ["approve"], {
    terminal: person({ choose: ["reject"], ask: ["El nombre viene de la config"] }),
  });
  expect(approved.code).toBe(0);
}

/** The change as the UI reads it: among the open ones, or by its id once it is archived. */
async function record({ server, headers }: Served, byId = false): Promise<Record<string, unknown>> {
  if (byId) return JSON.parse((await call(server.port, `/api/changes/${CHANGE}`, headers)).body);
  const records = JSON.parse((await call(server.port, "/api/changes", headers)).body);
  return records.find((one: { state: { id: string } }) => one.state.id === CHANGE);
}

/** When the person took their last `event`, as the change's audit says. */
async function decidedAt(root: string, event: string): Promise<string> {
  const lines = (await read(root, AUDIT)).trim().split("\n");
  const found = lines
    .map((line): { ts: string; actor: string; event: string } => JSON.parse(line))
    .filter((line) => line.event === event && line.actor === "human")
    .at(-1);
  return found?.ts ?? "";
}

/** The mark of a `specty wait` of the change, as `wait` leaves it, last renewed at `renewed`. */
async function waitMark(
  root: string,
  mark: {
    readonly pid: number;
    readonly tool: string;
    readonly ended?: { readonly at: string; readonly reason: string };
    readonly renewed?: string;
  },
): Promise<void> {
  const { renewed, ...held } = mark;
  const written = { since: at(-30), intervalMs: 500, timeoutSec: 3600, ...held };
  await writeFiles(root, { [MARK]: `${JSON.stringify(written, null, 2)}\n` });
  if (renewed !== undefined) await utimes(join(root, MARK), new Date(renewed), new Date(renewed));
}

/** A conversation of `tool` whose last step in `folder` was at `last`. */
async function stepped(root: string, folder: string, last: string, tool = "claude-code") {
  await writeFiles(root, {
    [`.git/common/specty/activity/${tool}-s1.json`]: JSON.stringify({
      tool,
      folder,
      first: at(-60),
      last,
    }),
  });
}

describe("the change the UI reads when nobody picks up the person's decision", () => {
  it("AC1: after the person approves from the UI with no `wait` and no conversation, it carries the decision's time", async () => {
    const served = await serving();
    try {
      await approveFromUi(served);
      const since = await decidedAt(served.root, "spec.approved");
      expect(since).not.toBe("");
      expect((await record(served)).unattended).toEqual({ since });
    } finally {
      await served.server.close();
    }
  });

  it("AC1: with no `wait`, says which conversation stepped last in its folder, and how many minutes ago", async () => {
    const served = await serving();
    try {
      await stepped(served.root, served.root, at(-7));
      await approveFromUi(served);
      const since = await decidedAt(served.root, "spec.approved");
      expect((await record(served)).unattended).toEqual({
        since,
        holder: { tool: "claude-code", ago: 7 },
      });
    } finally {
      await served.server.close();
    }
  });

  it("AC1: says the agent's `wait` ran out of time, its tool and how many minutes ago", async () => {
    const served = await serving();
    try {
      await waitMark(served.root, {
        pid: process.pid,
        tool: "claude-code",
        ended: { at: at(-12), reason: "timeout" },
      });
      await approveFromUi(served);
      const since = await decidedAt(served.root, "spec.approved");
      expect((await record(served)).unattended).toEqual({
        since,
        wait: { tool: "claude-code", ended: "timeout", ago: 12 },
      });
    } finally {
      await served.server.close();
    }
  });

  it("AC1: says the agent's `wait` was cut off when its process ended, and how many minutes ago", async () => {
    const served = await serving();
    try {
      await waitMark(served.root, { pid: deadPid(), tool: "codex", renewed: at(-3) });
      await approveFromUi(served);
      const since = await decidedAt(served.root, "spec.approved");
      expect((await record(served)).unattended).toEqual({
        since,
        wait: { tool: "codex", ended: "stopped", ago: 3 },
      });
    } finally {
      await served.server.close();
    }
  });

  it("AC1: also after the person decides the scope from the UI", async () => {
    const served = await serving();
    try {
      await implemented(served.root);
      await cli(served.root, ["scope", "add", "lib/other.ts", "--reason", "Ayudante"]);
      await decide(served, "scope/S1", { decision: "approved" });
      const since = await decidedAt(served.root, "scope.decided");
      expect((await record(served)).unattended).toEqual({ since });
    } finally {
      await served.server.close();
    }
  });

  it("AC1: also after the person asks for changes from the UI", async () => {
    const served = await serving();
    try {
      await decide(served, "comments", { anchor: { item: "A1" }, body: "Corto." });
      await decide(served, "request-changes");
      const since = await decidedAt(served.root, "review.changes_requested");
      expect((await record(served)).unattended).toEqual({ since });
    } finally {
      await served.server.close();
    }
  });

  it("AC1: also after the person rejects an assumption when approving at the terminal", async () => {
    const served = await serving();
    try {
      await rejectAtTerminal(served.root);
      const since = await decidedAt(served.root, "assumption.decided");
      expect(since).not.toBe("");
      expect((await record(served)).unattended).toEqual({ since });
    } finally {
      await served.server.close();
    }
  });

  it("AC1: also after the person accepts from the UI", async () => {
    const served = await serving();
    try {
      await implemented(served.root, "1\n", "2\n");
      await decide(served, "accept");
      const since = await decidedAt(served.root, "change.accepted");
      expect((await record(served)).unattended).toEqual({ since });
    } finally {
      await served.server.close();
    }
  });

  it("AC2: a live `wait` of the change picks up the decision: no `unattended`", async () => {
    const served = await serving();
    try {
      await approveFromUi(served);
      await waitMark(served.root, { pid: process.pid, tool: "claude-code" });
      expect(await record(served)).not.toHaveProperty("unattended");
    } finally {
      await served.server.close();
    }
  });

  it("AC2: nor once a `wait` ended picking up the decision", async () => {
    const served = await serving();
    try {
      await approveFromUi(served);
      await waitMark(served.root, {
        pid: process.pid,
        tool: "claude-code",
        ended: { at: at(1), reason: "decided" },
      });
      expect(await record(served)).not.toHaveProperty("unattended");
    } finally {
      await served.server.close();
    }
  });

  it("AC2: nor once a conversation stepped in the change's folder after the decision", async () => {
    const served = await serving();
    try {
      await approveFromUi(served);
      await stepped(served.root, served.root, at(1));
      expect(await record(served)).not.toHaveProperty("unattended");
    } finally {
      await served.server.close();
    }
  });

  it("AC2: nor once the agent wrote to the audit after the decision", async () => {
    const served = await serving();
    try {
      await approveFromUi(served);
      expect((await cli(served.root, ["note", "Sigo con T1."])).code).toBe(0);
      expect(await record(served)).not.toHaveProperty("unattended");
    } finally {
      await served.server.close();
    }
  });

  it("AC2: nor while the change still waits for the person", async () => {
    const served = await serving();
    try {
      await implemented(served.root);
      await cli(served.root, ["scope", "add", "lib/one.ts", "--reason", "Uno"]);
      await cli(served.root, ["scope", "add", "lib/two.ts", "--reason", "Dos"]);
      await decide(served, "scope/S1", { decision: "approved" });
      const seen = await record(served);
      expect(seen).toMatchObject({ state: { pending: { scopeRequests: [{ id: "S2" }] } } });
      expect(seen).not.toHaveProperty("unattended");
    } finally {
      await served.server.close();
    }
  });

  it("AC2: nor after the person rejects an assumption alone from the UI: the change still waits for them", async () => {
    const served = await serving();
    try {
      await decide(served, "assumptions/A1", {
        decision: "rejected",
        comment: "El nombre viene de la config",
      });
      expect(await record(served)).not.toHaveProperty("unattended");
    } finally {
      await served.server.close();
    }
  });

  it("AC2: nor when the person decides an assumption alone from the UI once the agent took up the review sent back", async () => {
    const served = await serving();
    try {
      await rejectAtTerminal(served.root);
      expect((await cli(served.root, ["note", "Reviso A1."])).code).toBe(0);
      await decide(served, "assumptions/A1", { decision: "confirmed" });
      expect(await record(served)).not.toHaveProperty("unattended");
    } finally {
      await served.server.close();
    }
  });

  it("AC2: nor once the person closed the change from the UI", async () => {
    const served = await serving();
    try {
      await implemented(served.root, "1\n", "2\n");
      await decide(served, "accept");
      const closing = "\n## Cierre\n\n### Resumen\n\nSaludo listo.\n";
      await writeFiles(served.root, {
        [SPEC_PATH]: `${await read(served.root, SPEC_PATH)}${closing}`,
      });
      expect((await cli(served.root, ["propose"])).code).toBe(0);
      await decide(served, "close");
      const seen = await record(served, true);
      expect(seen).toMatchObject({ state: { phase: "done" } });
      expect(seen).not.toHaveProperty("unattended");
    } finally {
      await served.server.close();
    }
  });

  it("AC2: nor when an agent took the decision in delegated mode", async () => {
    const served = await serving();
    try {
      const on = await cli(served.root, ["delegate", "on"], {
        terminal: person({ choose: ["yes"] }),
      });
      expect(on.code).toBe(0);
      expect((await cli(served.root, ["approve"])).code).toBe(0);
      const seen = await record(served);
      expect(seen).toMatchObject({ state: { phase: "implementing" } });
      expect(seen).not.toHaveProperty("unattended");
    } finally {
      await served.server.close();
    }
  });
});
