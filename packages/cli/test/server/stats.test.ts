// SPDX-License-Identifier: Apache-2.0
// `GET /api/stats` (ARCHITECTURE §15): the panel's figures for the cut the UI asks for, from the
// open and archived changes and the memory.
import { localDay } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { ARCHIVE, NOW, writeFiles } from "../support";
import { call, serving } from "./support";

/** Local noon `days` before the server's today, as an ISO time, and its day. */
const noon = (days: number) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, 12);
const at = (days: number) => noon(days).toISOString();
const day = (days: number) => localDay(noon(days));

interface Archived {
  readonly id: string;
  readonly kind: "standard" | "quick";
  readonly by: string;
  readonly tool: string;
  readonly model: string;
  /** Days before today it was created and closed. */
  readonly created: number;
  readonly closed: number;
  readonly tasks: number;
  readonly verified: readonly number[];
  readonly cost?: number;
}

/** An archived change, as `close` leaves it: its spec, its state and its audit. */
async function archive(root: string, change: Archived) {
  const agent = { actor: "agent", tool: change.tool, model: change.model };
  const lines = [
    { ts: at(change.created), ...agent, event: "change.created", data: { kind: change.kind } },
    ...Array.from({ length: change.tasks }, (_, index) => ({
      ts: at(change.closed),
      ...agent,
      event: "task.completed",
      data: { task: `T${index + 1}` },
    })),
    ...change.verified.map((exit) => ({
      ts: at(change.closed),
      actor: "specty",
      event: "task.verified",
      data: { task: "T1", cmd: "true", exit, ms: 10 },
    })),
    ...(change.cost === undefined
      ? []
      : [
          {
            ts: at(change.closed),
            actor: "specty",
            event: "change.usage",
            data: { calls: 2, input: 1, output: 1, cacheWrite: 0, cacheRead: 0, cost: change.cost },
          },
        ]),
    { ts: at(change.closed), ...agent, by: change.by, event: "change.closed", data: {} },
  ];
  const state = {
    schema: 1,
    id: change.id,
    kind: change.kind,
    phase: "done",
    revision: 1,
    approved: {
      revision: 1,
      hash: `sha256:${"b".repeat(64)}`,
      at: at(change.created),
      by: change.by,
      channel: "tty",
    },
    items: {},
    tasks: {},
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
  };
  const folder = `${ARCHIVE}/${change.id}`;
  await writeFiles(root, {
    [`${folder}/spec.md`]: `---\nkind: ${change.kind}\n---\n\n# ${change.id}\n`,
    [`${folder}/state.json`]: `${JSON.stringify(state, null, 2)}\n`,
    [`${folder}/audit.jsonl`]: `${lines.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  });
}

/** Bea's quick change of two days ago, and Carlos's feature of forty days ago. */
const BEA: Archived = {
  id: "20261001-de-bea",
  kind: "quick",
  by: "Bea",
  tool: "codex",
  model: "m-1",
  created: 3,
  closed: 2,
  tasks: 2,
  verified: [0, 0, 1],
  cost: 1.5,
};
const CARLOS: Archived = {
  id: "20260901-de-carlos",
  kind: "standard",
  by: "Carlos",
  tool: "claude-code",
  model: "m-2",
  created: 41,
  closed: 40,
  tasks: 1,
  verified: [0],
};

/** The server of a repository with the change in review and the two archived ones. */
async function panel() {
  const served = await serving(false);
  await archive(served.root, BEA);
  await archive(served.root, CARLOS);
  return served;
}

/** `GET /api/stats` with `query`, with the session, as the browser reads it. */
async function stats(port: number, headers: Record<string, string>, query = "") {
  const answer = await call(port, `/api/stats${query}`, headers);
  expect(answer.status).toBe(200);
  return JSON.parse(answer.body);
}

describe("the panel in the local server", () => {
  it("AC7: answers the figures of the last 30 days, its dates and the previous ones, who can be chosen and how many changes", async () => {
    const { server, headers } = await panel();
    try {
      const body = await stats(server.port, headers);
      expect(body.query).toEqual({ period: "30d" });
      expect(body.range).toEqual({ from: day(29), to: day(0) });
      expect(body.previous).toEqual({ from: day(59), to: day(30) });
      // Bea's change and the one in review lived in the period; Carlos's, before it.
      expect(body.changes).toBe(2);
      expect(body.summary.closed).toEqual({ value: 1, previous: 1, change: 0 });
      expect(body.summary.tasks).toEqual({ value: 2, previous: 1, change: 1 });
      // A day from created to closed, as the clock counts it (a change of time may move it).
      const cycle = noon(2).getTime() - noon(3).getTime();
      const before = noon(40).getTime() - noon(41).getTime();
      expect(body.summary.cycle.value).toBe(cycle);
      expect(body.summary.cycle.previous).toBe(before);
      expect(body.summary.cycle.change).toBeCloseTo((cycle - before) / before);
      expect(body.summary.verifications.value).toBeCloseTo(2 / 3);
      expect(body.summary.verifications.count).toBe(3);
      expect(body.summary.cost).toEqual({
        value: 1.5,
        previous: null,
        change: null,
        measured: 1,
        of: 1,
      });
      expect(body.summary.pending).toEqual({ value: 0, previous: 0, change: null });
      for (const who of [
        { kind: "person", name: "Bea" },
        { kind: "person", name: "Carlos" },
        { kind: "agent", name: "codex" },
        { kind: "agent", name: "claude-code" },
        { kind: "model", name: "m-1" },
        { kind: "model", name: "m-2" },
      ]) {
        expect(body.options).toContainEqual({ who, changes: 1 });
      }
      expect((await call(server.port, "/api/stats")).status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it("AC7: takes the default for a period, a who or a lane it does not understand", async () => {
    const { server, headers } = await panel();
    try {
      const body = await stats(server.port, headers, "?period=1y&who=nadie&kind=bug");
      expect(body.query).toEqual({ period: "30d" });
      expect(body.summary.closed.value).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("AC2: recalculates the figures for another period, a person, an agent, a model or a lane", async () => {
    const { server, headers } = await panel();
    try {
      const week = await stats(server.port, headers, "?period=7d&who=person%3ABea");
      expect(week.query).toEqual({ period: "7d", who: { kind: "person", name: "Bea" } });
      expect(week.range).toEqual({ from: day(6), to: day(0) });
      expect(week.changes).toBe(1);
      expect(week.summary.closed).toEqual({ value: 1, previous: 0, change: null });

      const carlos = await stats(server.port, headers, "?period=90d&who=agent%3Aclaude-code");
      expect(carlos.query).toEqual({ period: "90d", who: { kind: "agent", name: "claude-code" } });
      expect(carlos.summary.closed.value).toBe(1);
      expect(carlos.summary.tasks.value).toBe(1);

      const model = await stats(server.port, headers, "?who=model%3Am-1");
      expect(model.summary.tasks.value).toBe(2);

      const features = await stats(server.port, headers, "?kind=standard");
      expect(features.query).toEqual({ period: "30d", kind: "standard" });
      expect(features.summary.closed).toEqual({ value: 0, previous: 1, change: -1 });

      const all = await stats(server.port, headers, "?period=all");
      expect(all.query).toEqual({ period: "all" });
      expect(all).not.toHaveProperty("previous");
      expect(all.range.to).toBe(day(0));
      expect(all.summary.closed).toEqual({ value: 2 });
    } finally {
      await server.close();
    }
  });
});
