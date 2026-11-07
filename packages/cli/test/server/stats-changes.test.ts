// SPDX-License-Identifier: Apache-2.0
// `GET /api/stats/changes` (ARCHITECTURE §15): a page of the panel's table of changes for the cut,
// the search, the order and the page the UI asks for, from the open and archived changes.
import { localDay } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { ARCHIVE, CHANGE, NOW, writeFiles } from "../support";
import { call, serving } from "./support";

/** Local noon `days` before the server's today, as an ISO time, and its day. */
const noon = (days: number) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, 12);
const at = (days: number) => noon(days).toISOString();
const day = (days: number) => localDay(noon(days));

interface Archived {
  readonly id: string;
  readonly title: string;
  readonly kind: "standard" | "quick";
  readonly size: "S" | "M" | "L" | "XL";
  readonly by: string;
  readonly tool: string;
  /** Days before today it was created and closed. */
  readonly created: number;
  readonly closed: number;
  readonly tasks: number;
  readonly verified: readonly number[];
  readonly cost?: number;
}

/** An archived change, as `close` leaves it: its spec, its state and its audit. */
async function archive(root: string, change: Archived) {
  const agent = { actor: "agent", tool: change.tool };
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
    size: { level: change.size, score: 3, adjust: 0, reasons: [] },
    items: {},
    tasks: {},
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
  };
  const folder = `${ARCHIVE}/${change.id}`;
  await writeFiles(root, {
    [`${folder}/spec.md`]: `---\nkind: ${change.kind}\n---\n\n# ${change.title}\n`,
    [`${folder}/state.json`]: `${JSON.stringify(state, null, 2)}\n`,
    [`${folder}/audit.jsonl`]: `${lines.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  });
}

/** Bea's quick change of two days ago, and Carlos's feature of forty days ago. */
const BEA: Archived = {
  id: "20261001-informe-de-bea",
  title: "Informe de Bea",
  kind: "quick",
  size: "M",
  by: "Bea",
  tool: "codex",
  created: 3,
  closed: 2,
  tasks: 2,
  verified: [0, 1, 1],
  cost: 1.5,
};
const CARLOS: Archived = {
  id: "20260901-ajuste-de-carlos",
  title: "Ajuste de Carlos",
  kind: "standard",
  size: "XL",
  by: "Carlos",
  tool: "claude-code",
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

/** `GET /api/stats/changes` with `query`, with the session, as the browser reads it. */
async function changes(port: number, headers: Record<string, string>, query = "") {
  const answer = await call(port, `/api/stats/changes${query}`, headers);
  expect(answer.status).toBe(200);
  return JSON.parse(answer.body);
}

const ids = (body: { changes: readonly { id: string }[] }) => body.changes.map(({ id }) => id);

describe("the panel's table of changes in the local server", () => {
  it("AC6: answers the first page of the last 30 days, the last closed first, each change with its title, size and figures", async () => {
    const { server, headers } = await panel();
    try {
      const body = await changes(server.port, headers);
      expect(body.query).toEqual({ period: "30d" });
      expect(body.range).toEqual({ from: day(29), to: day(0) });
      expect(body.table).toEqual({
        q: "",
        sort: "closed",
        dir: "desc",
        offset: 0,
        limit: 25,
        lang: "es",
      });
      // Bea's change and the one in review lived in the period; Carlos's, before it.
      expect(body.total).toBe(2);
      expect(ids(body)).toEqual([BEA.id, CHANGE]);
      expect(body.changes[0]).toEqual({
        id: BEA.id,
        title: "Informe de Bea",
        kind: "quick",
        size: "M",
        agent: "codex",
        closed: at(2),
        tasks: 2,
        cycle: Date.parse(at(2)) - Date.parse(at(3)),
        failed: 2,
        cost: 1.5,
      });
      const open = body.changes[1];
      expect(open).toMatchObject({
        id: CHANGE,
        title: "Saludo personalizado",
        kind: "standard",
        tasks: 0,
        failed: 0,
      });
      expect(["S", "M", "L", "XL"]).toContain(open.size);
      for (const missing of ["closed", "cycle", "cost"]) expect(open).not.toHaveProperty(missing);
      expect((await call(server.port, "/api/stats/changes")).status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it("AC6: finds, sorts and pages within the cut that the UI asks for", async () => {
    const { server, headers } = await panel();
    try {
      const bea = await changes(server.port, headers, "?q=BEA");
      expect(bea.table.q).toBe("BEA");
      expect(bea.total).toBe(1);
      expect(ids(bea)).toEqual([BEA.id]);
      expect(ids(await changes(server.port, headers, "?q=saludo"))).toEqual([CHANGE]);

      const second = await changes(
        server.port,
        headers,
        "?period=90d&sort=title&dir=asc&offset=1&limit=1&lang=en",
      );
      expect(second.query).toEqual({ period: "90d" });
      expect(second.table).toEqual({
        q: "",
        sort: "title",
        dir: "asc",
        offset: 1,
        limit: 1,
        lang: "en",
      });
      // «Ajuste de Carlos», «Informe de Bea» and «Saludo personalizado»: the second.
      expect(second.total).toBe(3);
      expect(ids(second)).toEqual([BEA.id]);

      const carlos = await changes(server.port, headers, "?period=90d&who=person%3ACarlos");
      expect(carlos.query).toEqual({ period: "90d", who: { kind: "person", name: "Carlos" } });
      expect(ids(carlos)).toEqual([CARLOS.id]);
      expect(carlos.changes[0]).toMatchObject({ size: "XL", agent: "claude-code", failed: 0 });
      expect(ids(await changes(server.port, headers, "?kind=quick"))).toEqual([BEA.id]);
    } finally {
      await server.close();
    }
  });

  it("AC6: takes the default of each value it does not understand", async () => {
    const { server, headers } = await panel();
    try {
      const body = await changes(
        server.port,
        headers,
        "?period=1y&who=nadie&kind=bug&sort=nope&dir=up&offset=x&limit=1000&lang=fr",
      );
      expect(body.query).toEqual({ period: "30d" });
      expect(body.table).toEqual({
        q: "",
        sort: "closed",
        dir: "desc",
        offset: 0,
        limit: 25,
        lang: "es",
      });
      expect(ids(body)).toEqual([BEA.id, CHANGE]);
    } finally {
      await server.close();
    }
  });
});
