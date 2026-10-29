// SPDX-License-Identifier: Apache-2.0
import { ChangeStateSchema } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { exportContextOf } from "../src";

const STATE = ChangeStateSchema.parse({
  schema: 1,
  id: "20261024-saludo-personalizado",
  kind: "standard",
  phase: "done",
  branch: "specty/20261024-saludo-personalizado",
  baseCommit: "9f1c2e7",
  revision: 1,
  items: {},
  tasks: {},
  pending: { scopeRequests: [], adjustment: null },
  maxIds: { A: 0, AC: 0, T: 0, R: 0 },
});

describe("exportContextOf", () => {
  it("gives the id, the branch, the day it was created and the user's request", () => {
    const audit: readonly unknown[] = [
      "not an event",
      {
        ts: "2026-10-24T10:00:00.000Z",
        actor: "agent",
        event: "change.created",
        data: { kind: "standard", request: "que salude por nombre" },
      },
    ];
    expect(exportContextOf(STATE, audit)).toEqual({
      id: "20261024-saludo-personalizado",
      branch: "specty/20261024-saludo-personalizado",
      created: "2026-10-24",
      request: "que salude por nombre",
    });
  });

  it("leaves out what the change does not have", () => {
    const { branch: _, ...bare } = STATE;
    const audit = [{ actor: "agent", event: "change.created", data: "none" }];
    expect(exportContextOf(bare, audit)).toEqual({ id: "20261024-saludo-personalizado" });
    expect(exportContextOf(bare, [])).toEqual({ id: "20261024-saludo-personalizado" });
  });
});
