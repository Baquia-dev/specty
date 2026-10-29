// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { auditViewOf, ChangeStateSchema, parseSpec } from "../../src";

const HASH = `sha256:${"a".repeat(64)}`;

const STATE = ChangeStateSchema.parse({
  schema: 1,
  id: "20261024-saludo-personalizado",
  kind: "standard",
  phase: "implementing",
  branch: "specty/20261024-saludo-personalizado",
  baseCommit: "9f1c2e7",
  revision: 2,
  approved: { revision: 2, hash: HASH, at: "2026-10-24T10:10:00.000Z", by: "Ana", channel: "tty" },
  items: {},
  tasks: {
    T1: {
      status: "done",
      baseCommit: "9f1c2e7",
      commit: "a1b2c3d",
      attempts: 1,
      summary: "Saluda por nombre",
      scopeExtra: [],
    },
    T2: { status: "active", baseCommit: "a1b2c3d", attempts: 0, scopeExtra: [] },
  },
  pending: { scopeRequests: [], adjustment: null },
  maxIds: { A: 0, AC: 1, T: 2, R: 0 },
});

const SPEC = parseSpec(
  [
    "---",
    "kind: standard",
    "---",
    "",
    "# Saludo personalizado",
    "",
    "## Tareas",
    "",
    "- [x] T1: Saludar por nombre",
    "  - files: src/app.ts",
    "  - ac: AC1",
    "- [ ] T2: Mensaje por defecto",
    "  - files: src/app.ts",
    "  - ac: AC1",
    "",
  ].join("\n"),
).spec;

const AUDIT: readonly unknown[] = [
  {
    ts: "2026-10-24T10:00:00.000Z",
    actor: "agent",
    tool: "claude-code",
    event: "change.created",
    data: { kind: "standard", request: "que salude por nombre" },
  },
  "not an event",
  { ts: "2026-10-24T10:05:00.000Z", actor: "agent", event: "spec.proposed", data: [] },
  { actor: "human", event: "spec.approved" },
];

describe("auditViewOf", () => {
  it("builds the change as `specty audit` reports it", () => {
    expect(auditViewOf({ state: STATE, spec: SPEC, audit: AUDIT })).toEqual({
      id: "20261024-saludo-personalizado",
      title: "Saludo personalizado",
      kind: "standard",
      phase: "implementing",
      branch: "specty/20261024-saludo-personalizado",
      request: "que salude por nombre",
      approved: { revision: 2, at: "2026-10-24T10:10:00.000Z", by: "Ana", channel: "tty" },
      tasks: [
        {
          id: "T1",
          title: "Saludar por nombre",
          status: "done",
          commit: "a1b2c3d",
          summary: "Saluda por nombre",
        },
        { id: "T2", title: "Mensaje por defecto", status: "active" },
      ],
      events: [
        {
          ts: "2026-10-24T10:00:00.000Z",
          actor: "agent",
          tool: "claude-code",
          event: "change.created",
          data: { kind: "standard", request: "que salude por nombre" },
        },
        { ts: "2026-10-24T10:05:00.000Z", actor: "agent", event: "spec.proposed", data: {} },
      ],
    });
  });

  it("takes the commits it is given over those of the state", () => {
    const commits = new Map([["T2", "b2c3d4e"]]);
    const { tasks } = auditViewOf({ state: STATE, spec: SPEC, audit: [], commits });
    expect(tasks.map((task) => task.commit)).toEqual([undefined, "b2c3d4e"]);
  });

  it("falls back to the id without a title, and leaves out what the change does not have", () => {
    const { approved: _, branch: __, ...bare } = STATE;
    const view = auditViewOf({ state: bare, spec: { ...SPEC, title: "" }, audit: [] });
    expect(view.title).toBe("20261024-saludo-personalizado");
    expect(view).not.toHaveProperty("approved");
    expect(view).not.toHaveProperty("branch");
    expect(view).not.toHaveProperty("request");
  });
});
