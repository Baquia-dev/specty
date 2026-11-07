// SPDX-License-Identifier: Apache-2.0
// `GET /api/stats/export` (ARCHITECTURE §15): the panel's changes of the cut the UI asks for, open
// and archived, as a CSV or JSON file with its type and its name.
import { localDay } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { ARCHIVE, CHANGE, NOW, writeFiles } from "../support";
import { call, serving } from "./support";

/** Local noon `days` before today: as an ISO time, its day, and as a spreadsheet reads it. */
const noon = (days: number) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, 12);
const at = (days: number) => noon(days).toISOString();
const day = (days: number) => localDay(noon(days));
const local = (days: number) => `${day(days)} 12:00`;

/** The hours from `from` to `to`, with two decimals, as the CSV writes the cycle. */
const hours = (from: string, to: string) =>
  ((Date.parse(to) - Date.parse(from)) / 3_600_000).toFixed(2);

const HEADER_ES =
  "Cambio,Título,Carril,Tamaño,Persona,Agente,Modelo,Creado,Cerrado,Tareas,Ciclo (horas),Verificaciones,Verificaciones fallidas,Coste (USD)";
const HEADER_EN =
  "Change,Title,Lane,Size,Person,Agent,Model,Created,Closed,Tasks,Cycle (hours),Verifications,Failed verifications,Cost (USD)";

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

/** `GET /api/stats/export` with `query`, with the session, as the browser downloads it. */
async function exported(port: number, headers: Record<string, string>, query = "") {
  const answer = await call(port, `/api/stats/export${query}`, headers);
  expect(answer.status).toBe(200);
  return answer;
}

/** The CSV's lines, without its BOM and without the empty one after the last CRLF. */
function csvLines(body: string): readonly string[] {
  expect(body.startsWith("\uFEFF")).toBe(true);
  expect(body.endsWith("\r\n")).toBe(true);
  return body.slice(1, -2).split("\r\n");
}

describe("the panel's export in the local server", () => {
  it("AC4: answers the CSV of the last 30 days as a download named by its period, with the open and archived changes", async () => {
    const { server, headers } = await panel();
    try {
      const answer = await exported(server.port, headers);
      expect(answer.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(answer.headers["content-disposition"]).toBe(
        `attachment; filename="specty-stats-${day(29)}-${day(0)}.csv"`,
      );
      expect(answer.headers["x-content-type-options"]).toBe("nosniff");
      expect(answer.headers["cache-control"]).toBe("no-store");
      const lines = csvLines(answer.body);
      // Bea's change and the one in review lived in the period; Carlos's, before it.
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe(HEADER_ES);
      expect(lines[1]).toBe(
        `${BEA.id},Informe de Bea,Quick,M,Bea,Codex,,${local(3)},${local(2)},2,${hours(at(3), at(2))},3,2,1.50`,
      );
      expect(lines[2]?.startsWith(`${CHANGE},Saludo personalizado,Feature,`)).toBe(true);
      expect((await call(server.port, "/api/stats/export")).status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it("AC4: answers the JSON of the cut the UI asks for", async () => {
    const { server, headers } = await panel();
    try {
      const answer = await exported(
        server.port,
        headers,
        "?format=json&period=90d&who=person%3ACarlos",
      );
      expect(answer.headers["content-type"]).toBe("application/json; charset=utf-8");
      expect(answer.headers["content-disposition"]).toBe(
        `attachment; filename="specty-stats-${day(89)}-${day(0)}.json"`,
      );
      expect(JSON.parse(answer.body)).toEqual({
        query: { period: "90d", who: { kind: "person", name: "Carlos" } },
        range: { from: day(89), to: day(0) },
        changes: [
          {
            id: CARLOS.id,
            title: "Ajuste de Carlos",
            kind: "standard",
            size: "XL",
            person: "Carlos",
            agent: "claude-code",
            created: at(41),
            closed: at(40),
            tasks: 1,
            cycle: Date.parse(at(40)) - Date.parse(at(41)),
            verifications: 1,
            failed: 0,
          },
        ],
      });
    } finally {
      await server.close();
    }
  });

  it("AC4: takes the default of each value it does not understand, and the language the UI asks for", async () => {
    const { server, headers } = await panel();
    try {
      const odd = await exported(
        server.port,
        headers,
        "?format=xlsx&period=1y&who=nadie&kind=bug&lang=fr",
      );
      expect(odd.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(odd.headers["content-disposition"]).toBe(
        `attachment; filename="specty-stats-${day(29)}-${day(0)}.csv"`,
      );
      const lines = csvLines(odd.body);
      expect(lines[0]).toBe(HEADER_ES);
      expect(lines.slice(1).map((line) => line.split(",")[0])).toEqual([BEA.id, CHANGE]);

      const english = csvLines((await exported(server.port, headers, "?lang=en&kind=quick")).body);
      expect(english).toEqual([
        HEADER_EN,
        `${BEA.id},Informe de Bea,Quick,M,Bea,Codex,,${local(3)},${local(2)},2,${hours(at(3), at(2))},3,2,1.50`,
      ]);
    } finally {
      await server.close();
    }
  });
});
