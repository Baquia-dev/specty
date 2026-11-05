// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { editMemory } from "../../src/store/memory";
import { AGENT, ARCHIVE, CHANGE, CONFIG, SPEC, writeFiles } from "../support";
import { call, serving, sessionAt, state } from "./support";

const EPIC = "20261001-panel-academico";
const SLICE = "20261002-notas-del-corte";
const ORPHAN = "20261003-huerfano";
const LOST_EPIC = "20260901-perdida";
const GONE = "20260801-ya-no-existe";

/** SPEC's change as the slice C1 of the archived epic. */
const SLICE_SPEC = SPEC.replace("kind: standard\n", `kind: standard\nepic: ${EPIC}\nslice: C1\n`);

/** A change in the archive, done: its spec with its title and frontmatter, its state and its audit. */
function archived(
  base: Readonly<Record<string, unknown>>,
  change: { readonly id: string; readonly title: string; readonly kind: string },
  front: readonly string[] = [],
): Record<string, string> {
  const dir = `${ARCHIVE}/${change.id}`;
  const closed = {
    ts: "2026-10-01T08:00:00.000Z",
    actor: "human",
    event: "change.closed",
    data: {},
  };
  const { size: _unsized, ...rest } = base;
  return {
    [`${dir}/spec.md`]: `---\n${[`kind: ${change.kind}`, ...front].join("\n")}\n---\n\n# ${change.title}\n`,
    [`${dir}/state.json`]: `${JSON.stringify({ ...rest, id: change.id, kind: change.kind, phase: "done", tasks: {} })}\n`,
    [`${dir}/audit.jsonl`]: `${JSON.stringify(closed)}\n`,
  };
}

/** An open pending item, from `change` when there is one. */
const entry = (id: string, change?: string): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: "2026-11-06T10:00:00.000Z",
  origin: change === undefined ? { by: "claude-code" } : { change, by: "claude-code" },
  text: `Texto de ${id}`,
});

/** Writes `entries` into the memory's branch, one commit each, as `memory add` does. */
async function remember(root: string, entries: readonly MemoryEntry[]) {
  const session = await sessionAt(root, AGENT);
  const target = { branch: session.config.memory.branch, lang: "es" as const, trailers: {} };
  for (const written of entries) {
    await editMemory(session.git, target, () => ({
      write: { entry: written, operation: "add" as const },
      result: undefined,
    }));
  }
}

describe("the changes the memory's entries came from, in the local server", () => {
  it("AC1: gives the title, kind, phase and epic of each change of origin, open or archived, and its id when it is gone", async () => {
    const { root, server, headers } = await serving(false, CONFIG(), SLICE_SPEC);
    try {
      const before = await call(server.port, "/api/memory", headers);
      expect(JSON.parse(before.body).origins).toEqual({});
      const base = await state(root);
      await writeFiles(root, {
        ...archived(base, { id: EPIC, title: "Panel académico", kind: "epic" }),
        ...archived(base, { id: SLICE, title: "Notas del corte", kind: "standard" }, [
          `epic: ${EPIC}`,
          "slice: C2",
        ]),
        ...archived(base, { id: ORPHAN, title: "Corte sin su épica", kind: "standard" }, [
          `epic: ${LOST_EPIC}`,
          "slice: C3",
        ]),
      });
      await remember(root, [
        entry("P1", CHANGE),
        entry("P2", SLICE),
        entry("P3", EPIC),
        entry("P4", ORPHAN),
        entry("P5", GONE),
        entry("P6"),
        entry("P7", CHANGE),
      ]);
      const answer = await call(server.port, "/api/memory", headers);
      expect(answer.status).toBe(200);
      const body = JSON.parse(answer.body);
      expect(body.entries.map((item: { id: string }) => item.id)).toEqual([
        "P1",
        "P2",
        "P3",
        "P4",
        "P5",
        "P6",
        "P7",
      ]);
      expect(body.origins).toEqual({
        [CHANGE]: {
          title: "Saludo personalizado",
          kind: "standard",
          phase: "review",
          epic: { id: EPIC, title: "Panel académico", slice: "C1" },
        },
        [SLICE]: {
          title: "Notas del corte",
          kind: "standard",
          phase: "done",
          epic: { id: EPIC, title: "Panel académico", slice: "C2" },
        },
        [EPIC]: { title: "Panel académico", kind: "epic", phase: "done" },
        [ORPHAN]: {
          title: "Corte sin su épica",
          kind: "standard",
          phase: "done",
          epic: { id: LOST_EPIC, title: LOST_EPIC, slice: "C3" },
        },
        [GONE]: { title: GONE },
      });
    } finally {
      await server.close();
    }
  });
});
