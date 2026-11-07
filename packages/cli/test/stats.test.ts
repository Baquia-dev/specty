// SPDX-License-Identifier: Apache-2.0
// `specty stats` (ARCHITECTURE §6): the panel's summary in the terminal, for the cut asked for,
// read as `GET /api/stats` reads it.
import { localDay } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { call, serving } from "./server/support";
import { ARCHIVE, CONFIG, cli, NOW, tempRepo, writeFiles } from "./support";

/** Local noon `days` before the CLI's today, as an ISO time, and its day. */
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
    {
      ts: at(change.closed),
      actor: "specty",
      event: "task.verified",
      data: { task: "T1", cmd: "true", exit: 0, ms: 10 },
    },
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
};

/** A repository with Bea's and Carlos's changes archived, and nothing open. */
async function repository() {
  const root = await tempRepo({ ".specty/config.yaml": CONFIG() });
  await archive(root, BEA);
  await archive(root, CARLOS);
  return root;
}

/** The lines of a card's block, by its title. */
const block = (text: string, title: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf(`${title}:`);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && !line.startsWith("  "));
  return lines.slice(start + 1, end < 0 ? undefined : end).map((line) => line.trim());
};

/** The first cell of each row of a table, its header left out. */
const names = (rows: readonly string[]) => rows.slice(1).map((row) => row.split(/\s{2,}/)[0]);

describe("specty stats", () => {
  it("AC1: prints the last 30 days with their dates, the six figures against the 30 days before and a row per person, agent and model", async () => {
    const root = await repository();
    const run = await cli(root, ["stats"]);
    expect(run.code).toBe(0);
    expect(run.out.split("\n")[0]).toBe(
      `SPECTY · stats · últimos 30 días · ${day(29)} – ${day(0)}`,
    );
    const figures = block(run.out, "INDICADORES, FRENTE A LOS 30 DÍAS ANTERIORES");
    expect(figures).toHaveLength(6);
    expect(figures[0]).toBe("Cambios cerrados: 1 · sin cambios");
    expect(figures[1]).toBe("Tareas completadas: 2 · ▲ 100 %");
    expect(figures[3]).toBe(
      "Verificaciones que pasan: 100 % de 1 verificación de tarea · sin cambios",
    );
    expect(figures[4]).toBe("Coste medido: 1,50 USD en 1 de 1 cambio cerrado · sin datos antes");
    // Only Bea's change lived in the period; Carlos's, before it.
    expect(names(block(run.out, "POR PERSONA"))).toEqual(["Bea"]);
    expect(names(block(run.out, "POR AGENTE"))).toEqual(["codex"]);
    expect(names(block(run.out, "POR MODELO"))).toEqual(["m-1"]);
    // The cycle is a day as the clock counts it: a change of time may move it.
    expect(block(run.out, "POR PERSONA")[1]?.split(/\s{2,}/)).toEqual([
      "Bea",
      "1",
      "2",
      expect.stringMatching(/^(1 d|1 d 1 h|23 h)$/),
      "100 %",
      // AC1: codex does not tell its session, so nothing measures them.
      "—",
      "1,50 USD",
    ]);
    // AC2: nor in the costliest changes.
    expect(block(run.out, "LOS CAMBIOS MÁS CAROS")[1]?.split(/\s{2,}/)).toEqual([
      "20261001-de-bea",
      "quick",
      "2",
      expect.stringMatching(/^(1 d|1 d 1 h|23 h)$/),
      "—",
      "1,50 USD",
    ]);
  });

  it("AC2: --period, --who and --kind change the cut, and the header says it; «all» compares with nothing", async () => {
    const root = await repository();
    const carlos = await cli(root, ["stats", "--period", "90d", "--who", "person:Carlos"]);
    expect(carlos.code).toBe(0);
    expect(carlos.out.split("\n")[0]).toBe(
      `SPECTY · stats · últimos 90 días · ${day(89)} – ${day(0)} · persona Carlos`,
    );
    expect(block(carlos.out, "INDICADORES, FRENTE A LOS 90 DÍAS ANTERIORES")[0]).toBe(
      "Cambios cerrados: 1 · sin datos antes",
    );
    // The rows are every person, agent and model of the lane, to choose another cut from.
    expect(names(block(carlos.out, "POR AGENTE"))).toEqual(["claude-code", "codex"]);

    const agent = await cli(root, ["stats", "--period", "7d", "--who", "agent:codex"]);
    expect(agent.out.split("\n")[0]).toContain("· últimos 7 días ·");
    expect(agent.out.split("\n")[0]).toContain("· agente codex");
    expect(block(agent.out, "INDICADORES, FRENTE A LOS 7 DÍAS ANTERIORES")[1]).toBe(
      "Tareas completadas: 2 · sin datos antes",
    );

    const lane = await cli(root, ["stats", "--period", "90d", "--kind", "standard"]);
    expect(lane.out.split("\n")[0]).toContain("· carril standard");
    expect(names(block(lane.out, "POR PERSONA"))).toEqual(["Carlos"]);

    const model = await cli(root, ["stats", "--who", "model:m-1"]);
    expect(model.out.split("\n")[0]).toContain("· modelo m-1");

    const all = await cli(root, ["stats", "--period", "all"]);
    expect(all.code).toBe(0);
    expect(all.out.split("\n")[0]).toMatch(/^SPECTY · stats · todo · \d{4}-\d{2}-\d{2} – /);
    expect(block(all.out, "INDICADORES")).toEqual([
      "Cambios cerrados: 2",
      "Tareas completadas: 3",
      expect.stringMatching(/^Ciclo \(mediana\): /),
      "Verificaciones que pasan: 100 % de 2 verificaciones de tarea",
      "Coste medido: 1,50 USD en 1 de 2 cambios cerrados",
      "Pendientes abiertos: 0",
    ]);
    expect(names(block(all.out, "POR PERSONA"))).toEqual(["Bea", "Carlos"]);
  });

  it("AC3: --json gives the same data as GET /api/stats for the same cut", async () => {
    const { root, server, headers } = await serving(false);
    try {
      await archive(root, BEA);
      await archive(root, CARLOS);
      for (const [argv, query] of [
        [[], ""],
        [["--period", "90d", "--who", "person:Carlos"], "?period=90d&who=person%3ACarlos"],
        [["--period", "all", "--kind", "quick"], "?period=all&kind=quick"],
      ] as const) {
        const answer = await call(server.port, `/api/stats${query}`, headers);
        expect(answer.status).toBe(200);
        const run = await cli(root, ["stats", ...argv, "--json"]);
        expect(run.code).toBe(0);
        expect(JSON.parse(run.out)).toEqual(JSON.parse(answer.body));
      }
      const global = await cli(root, ["--json", "stats"]);
      expect(JSON.parse(global.out)).toEqual(
        JSON.parse((await call(server.port, "/api/stats", headers)).body),
      );
    } finally {
      await server.close();
    }
  });

  it("AC4: refuses a period, a who or a lane it does not understand, with exit code 1", async () => {
    const root = await repository();
    const period = await cli(root, ["stats", "--period", "1y"]);
    expect(period.code).toBe(1);
    expect(period.out).toContain("No conozco el periodo 1y.");
    expect(period.out).toContain("--period 90d");

    const who = await cli(root, ["stats", "--who", "nadie"]);
    expect(who.code).toBe(1);
    expect(who.out).toContain("nadie");
    expect(who.out).toContain("person:<nombre>");

    const kind = await cli(root, ["stats", "--kind", "bug"]);
    expect(kind.code).toBe(1);
    expect(kind.out).toContain("No conozco el carril bug.");
    expect(kind.out).toContain("standard");
  });

  it("AC5: a cut with no change in the period says so, without figures nor tables", async () => {
    const root = await repository();
    const run = await cli(root, ["stats", "--period", "7d", "--who", "person:Carlos"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain("No hay ningún cambio en este corte en el periodo.");
    expect(run.out).not.toContain("INDICADORES");
    expect(run.out).not.toContain("POR PERSONA");

    const bare = await cli(await tempRepo({ ".specty/config.yaml": CONFIG() }), ["stats"]);
    expect(bare.code).toBe(0);
    expect(bare.out).toContain("No hay ningún cambio en este corte en el periodo.");
  });
});
